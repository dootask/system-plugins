import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'

// 数据落在挂载卷上：容器内 WORKDIR=/app，compose 挂 approve-data 到 /app/data。
// 本地开发默认写到 src/data/，已在 .gitignore 中忽略。
//
// M1 数据层：在 migrate() 里建全部审批业务表（幂等）。表结构以 REWRITE_PLAN.md §4 为准，
// 并补充了支撑「同构运行时引擎」所需的运行时字段（见 §引擎运行时字段注释）。
// M5 数据迁移时，会另起一段只读连旧 MySQL 的逻辑（见 docker-compose.yml 注释）。
const DATA_DIR = process.env.APPROVE_DATA_DIR || resolve(process.cwd(), 'data')

let _db: Database.Database | null = null

/** 测试用：用内存库或指定文件覆盖默认连接。调用后 getDb() 返回该库。 */
export function setDbForTesting(db: Database.Database): void {
  if (_db && _db !== db) _db.close()
  _db = db
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
}

export function getDb(): Database.Database {
  if (_db) return _db
  mkdirSync(DATA_DIR, { recursive: true })
  const db = new Database(dbFilePath())
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  _db = db
  // 首启 hook：仅真实文件库触发一次 M5 旧库迁移（测试用 setDbForTesting 不走这里）。
  // 动态 import 避免 db.ts → migrate → db.ts 的循环依赖；异步且不阻断（内部自吞异常）。
  triggerFirstBootMigration()
  return db
}

let _migrationTriggered = false

/**
 * 一次性触发首启迁移 + 内置模板播种（幂等由 sys_settings 标记兜底，这里仅防重复 import）。
 * 先迁移（旧库模板/实例入新库），迁移结束后再播种内置模板——播种内部见库已有模板即跳过，
 * 故迁移带入模板时不会重复造数据；全新安装（无旧库）则注入请假/加班/报销/差旅/评审。
 */
function triggerFirstBootMigration(): void {
  if (_migrationTriggered) return
  _migrationTriggered = true
  void import('#/lib/migrate/migrate')
    .then((m) => m.ensureMigrated())
    .catch(() => {
      /* 迁移失败不阻断启动，ensureMigrated 内部已记日志 */
    })
    .finally(() => {
      void import('#/lib/seed/builtin')
        .then((m) => m.ensureBuiltinSeeded())
        .catch(() => {
          /* 播种失败不阻断启动 */
        })
    })
}

/** 数据目录（备份文件等写在其下）。 */
export function dataDir(): string {
  return DATA_DIR
}

/** 主数据库文件路径。 */
export function dbFilePath(): string {
  return resolve(DATA_DIR, 'approve.db')
}

/** 关闭当前连接并清空缓存，下次 getDb() 会重新打开。 */
export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

export function migrate(db: Database.Database) {
  db.exec(`
    -- 流程定义(模板)：同时承载「审批节点编排」与「自定义表单 schema」。
    CREATE TABLE IF NOT EXISTS proc_def (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'custom',  -- vacate/overtime/reimburse/travel/review/custom
      icon        TEXT,
      form_schema TEXT NOT NULL DEFAULT '[]',      -- JSON: 字段定义数组
      flow_nodes  TEXT NOT NULL DEFAULT '{}',      -- JSON: 审批节点树(approver/notifier/route)，启动时展开成线性 NodeInfo[]
      start_scope TEXT,                            -- JSON: 可发起范围(部门/角色/人)，空=所有人
      version     INTEGER NOT NULL DEFAULT 1,
      status      TEXT NOT NULL DEFAULT 'enabled', -- enabled/disabled
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_by  INTEGER NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 流程实例（运行时）。state/cur_node_seq_idx/node_sequence 是与旧 Go 引擎同构的运行时模型：
    --   启动时把 flow_nodes 流程树展开成线性 NodeInfo[]（含条件分支按 form_data 求值定死的结果），
    --   存入 node_sequence；cur_node_seq_idx = 当前节点在该数组里的索引（旧引擎 Step）。
    CREATE TABLE IF NOT EXISTS proc_inst (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      def_id           INTEGER NOT NULL REFERENCES proc_def(id),
      def_version      INTEGER NOT NULL,
      title            TEXT NOT NULL,
      form_data        TEXT NOT NULL DEFAULT '{}',    -- JSON: 按 schema 填写的值
      initiator_id     INTEGER NOT NULL,
      dept_id          INTEGER,
      status           TEXT NOT NULL DEFAULT 'running',-- draft/running/approved/rejected/withdrawn/archived
      -- 运行时引擎字段（同构旧 Go 引擎）：
      state            INTEGER NOT NULL DEFAULT 0,     -- 0待审/1审批中/2通过/3拒绝/4撤回
      node_sequence    TEXT NOT NULL DEFAULT '[]',     -- JSON: 展开后的 NodeInfo[]
      cur_node_seq_idx INTEGER NOT NULL DEFAULT 0,     -- 指针=node_sequence 数组索引(旧引擎 Step)
      cur_node_id      TEXT,                           -- 冗余：当前节点 nodeId（便于查询/兼容 §4）
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at      TEXT
    );

    -- 审批任务（一个节点一条 task）：会签靠 pending_count 递减（==0 且无拒绝即通过）。
    CREATE TABLE IF NOT EXISTS proc_task (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      inst_id          INTEGER NOT NULL REFERENCES proc_inst(id) ON DELETE CASCADE,
      node_id          TEXT NOT NULL,
      node_seq_idx     INTEGER NOT NULL DEFAULT 0,     -- 对应 proc_inst.node_sequence 的索引
      node_name        TEXT,
      approve_mode     TEXT NOT NULL DEFAULT 'or',     -- cosign(会签)/or(或签)/sequence(依次)
      assignee_id      INTEGER,                        -- 兼容 §4；多审批人见 proc_actor
      total_approvers  INTEGER NOT NULL DEFAULT 0,     -- 应审批人数
      pending_count    INTEGER NOT NULL DEFAULT 0,     -- 待审计数(递减)
      agree_count      INTEGER NOT NULL DEFAULT 0,     -- 已同意计数
      is_finished      INTEGER NOT NULL DEFAULT 0,     -- 该节点是否已结束
      state            TEXT NOT NULL DEFAULT 'pending',-- pending/approved/rejected/transferred/skipped
      comment          TEXT,
      due_at           TEXT,                           -- 时限(评审时间节点)
      acted_at         TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 参与人/抄送人（候选、抄送、加签）。node_seq_idx 把 actor 锚到线性序列的某个节点。
    CREATE TABLE IF NOT EXISTS proc_actor (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      inst_id      INTEGER NOT NULL REFERENCES proc_inst(id) ON DELETE CASCADE,
      task_id      INTEGER,
      node_seq_idx INTEGER NOT NULL DEFAULT 0,
      userid       INTEGER NOT NULL,
      role         TEXT NOT NULL,                      -- approver/cc/addsign
      action       TEXT NOT NULL DEFAULT 'pending',    -- pending/approved/rejected/withdrawn
      comment      TEXT,
      is_system    INTEGER NOT NULL DEFAULT 0,         -- 系统自动处理(抄送/发起人自审自动跳过)
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 操作流水/时间线（同意/拒绝/退回/撤回/转交/加签/评论/归档）。
    CREATE TABLE IF NOT EXISTS proc_event (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      inst_id   INTEGER NOT NULL REFERENCES proc_inst(id) ON DELETE CASCADE,
      task_id   INTEGER,
      actor_id  INTEGER NOT NULL,
      action    TEXT NOT NULL,  -- submit/approve/reject/return/withdraw/transfer/addsign/comment/archive
      remark    TEXT,
      attachments TEXT,         -- JSON: 评论/意见附带的图片 CommentImage[]
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 附件（引用主程序文件；见 §6 附件方案）。
    CREATE TABLE IF NOT EXISTS proc_attachment (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      inst_id     INTEGER NOT NULL REFERENCES proc_inst(id) ON DELETE CASCADE,
      field_key   TEXT,
      file_id     INTEGER,    -- 旧：主程序 File id（历史数据，新上传不再用）
      local_path  TEXT,       -- 或插件自存路径(备选)
      url         TEXT,       -- 新：插件本地上传访问 URL(/apps/approve/api/uploads/<uuid>)
      name        TEXT,
      size        INTEGER,
      ext         TEXT,
      mime        TEXT,
      uploaded_by INTEGER NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 待办-消息映射（仿 core 的 ApproveProcMsg，用于点开详情/撤回时回收消息）。
    CREATE TABLE IF NOT EXISTS proc_msg (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      inst_id   INTEGER NOT NULL,
      task_id   INTEGER,
      userid    INTEGER NOT NULL,
      dialog_id INTEGER,
      msg_id    INTEGER,
      kind      TEXT NOT NULL,  -- reviewer/cc/result/comment
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- key-value 系统设置：存凭据 / 开关等（仅管理员可写）。
    CREATE TABLE IF NOT EXISTS sys_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_proc_def_status     ON proc_def(status, sort_order);
    CREATE INDEX IF NOT EXISTS idx_proc_inst_initiator ON proc_inst(initiator_id, status);
    CREATE INDEX IF NOT EXISTS idx_proc_inst_def       ON proc_inst(def_id);
    CREATE INDEX IF NOT EXISTS idx_proc_task_assignee  ON proc_task(assignee_id, state);
    CREATE INDEX IF NOT EXISTS idx_proc_task_inst      ON proc_task(inst_id);
    CREATE INDEX IF NOT EXISTS idx_proc_actor_user     ON proc_actor(userid, role);
    CREATE INDEX IF NOT EXISTS idx_proc_actor_inst     ON proc_actor(inst_id);
    CREATE INDEX IF NOT EXISTS idx_proc_event_inst     ON proc_event(inst_id);
    CREATE INDEX IF NOT EXISTS idx_proc_attach_inst    ON proc_attachment(inst_id);
    CREATE INDEX IF NOT EXISTS idx_proc_msg_inst       ON proc_msg(inst_id);
    CREATE INDEX IF NOT EXISTS idx_proc_msg_user       ON proc_msg(userid);
  `)

  // 旧库补列（升级路径，幂等）。CREATE 已含这些列，仅为从早期 schema 升级用。
  addColumnIfMissing(db, 'proc_inst', 'state', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing(
    db,
    'proc_inst',
    'node_sequence',
    "TEXT NOT NULL DEFAULT '[]'",
  )
  addColumnIfMissing(
    db,
    'proc_inst',
    'cur_node_seq_idx',
    'INTEGER NOT NULL DEFAULT 0',
  )
  addColumnIfMissing(
    db,
    'proc_task',
    'node_seq_idx',
    'INTEGER NOT NULL DEFAULT 0',
  )
  addColumnIfMissing(
    db,
    'proc_task',
    'total_approvers',
    'INTEGER NOT NULL DEFAULT 0',
  )
  addColumnIfMissing(
    db,
    'proc_task',
    'pending_count',
    'INTEGER NOT NULL DEFAULT 0',
  )
  addColumnIfMissing(
    db,
    'proc_task',
    'agree_count',
    'INTEGER NOT NULL DEFAULT 0',
  )
  addColumnIfMissing(
    db,
    'proc_task',
    'is_finished',
    'INTEGER NOT NULL DEFAULT 0',
  )
  addColumnIfMissing(
    db,
    'proc_actor',
    'node_seq_idx',
    'INTEGER NOT NULL DEFAULT 0',
  )
  addColumnIfMissing(
    db,
    'proc_actor',
    'action',
    "TEXT NOT NULL DEFAULT 'pending'",
  )
  addColumnIfMissing(db, 'proc_actor', 'comment', 'TEXT')
  addColumnIfMissing(
    db,
    'proc_actor',
    'is_system',
    'INTEGER NOT NULL DEFAULT 0',
  )
  addColumnIfMissing(db, 'proc_event', 'attachments', 'TEXT')
  addColumnIfMissing(db, 'proc_attachment', 'url', 'TEXT')
  addColumnIfMissing(db, 'proc_attachment', 'mime', 'TEXT')
}

/** 若表缺少某列则追加（幂等，用于已存在的数据库升级）。 */
function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  type: string,
) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string
  }>
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}
