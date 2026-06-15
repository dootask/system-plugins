/**
 * M5 一次性迁移编排：旧 MySQL（只读）→ 本插件 SQLite。
 *
 * 触发：首启 hook（ensureMigrated，见 db.ts 调用点）或管理员手动触发（routes/api/admin.migrate）。
 *
 * 幂等：sys_settings.migrated_at 已写 → 直接跳过。
 * 原子/可重入：全部写入在**单个 SQLite 事务**内完成，最后才写 migrated_at；
 *   任一步抛错则整个事务回滚（新库无残留），下次可干净重跑。只读老库、不删老表。
 * 进度日志：每个阶段 / 每 N 条打点（console，docker logs 可见）。
 *
 * 映射：
 *  - 每个旧 procdef → 一个新 proc_def（flow_nodes + 为请假/加班构造 form_schema）。
 *  - 已结束实例(state 2/3/4) → proc_inst(status/form_data) + 重建 proc_event 时间线 + proc_actor（只读历史）。
 *  - 进行中实例(state 0/1) → 无缝续跑：node_sequence/cur_node_seq_idx/proc_task 计数/proc_actor 全量重建。
 */
import type Database from 'better-sqlite3'
import { getDb } from '#/lib/db'
import { SETTING_KEYS } from '#/lib/repo/settings'
import type { LegacySource } from './legacy-types'
import { createMysqlSource, mysqlConfigFromEnv } from './mysql-source'
import {
  actTypeToMode,
  convertNodeInfos,
  convertResourceToFlow,
  identityToActor,
  identityToEventAction,
  inferCategoryAndSchema,
  isFinishedState,
  parseIds,
  stateToStatus,
  stepToSeqIdx,
  varToFormData,
} from './transform'

export interface MigrationResult {
  migrated: boolean
  reason?: string
  defs: number
  instsFinished: number
  instsRunning: number
  tasks: number
  actors: number
  events: number
}

type Logger = (msg: string) => void

const log: Logger = (msg) => console.log(`[approve-migrate] ${msg}`)

/**
 * 首启 hook：未迁则迁，已迁则跳过；任何异常**不阻断**应用启动（仅记日志），
 * 以便迁移失败时插件仍能用新库运行，管理员可再手动触发。
 */
export async function ensureMigrated(): Promise<void> {
  try {
    const db = getDb()
    if (alreadyMigrated(db)) return
    const cfg = mysqlConfigFromEnv()
    if (!cfg) {
      log('未配置旧库连接（DB_HOST/DB_DATABASE/DB_USERNAME 缺失），跳过迁移')
      return
    }
    log('检测到未迁移且配置了旧库，开始数据迁移…')
    let source: LegacySource | null = null
    try {
      source = await createMysqlSource(cfg)
      const r = await runMigration(source, db)
      log(`迁移完成：${JSON.stringify(r)}`)
    } finally {
      await source?.close().catch(() => {})
    }
  } catch (e) {
    log(`迁移失败（不阻断启动，可稍后手动重试）：${(e as Error).message}`)
  }
}

/** 是否已迁移（sys_settings.migrated_at 存在）。 */
export function alreadyMigrated(db: Database.Database): boolean {
  const row = db
    .prepare('SELECT value FROM sys_settings WHERE key = ?')
    .get(SETTING_KEYS.migratedAt) as { value: string } | undefined
  return !!row?.value
}

/**
 * 执行迁移（全程单事务）。可被首启 hook 或手动触发调用，亦供单测直接喂内存假源。
 * @param source 旧库只读源（真实=MySQL，测试=内存假实现）。
 * @param db 目标 SQLite（默认主库；测试传内存库）。
 * @param force 已迁移时是否强制重跑（默认 false：已迁则不重复）。
 */
export async function runMigration(
  source: LegacySource,
  db: Database.Database = getDb(),
  force = false,
): Promise<MigrationResult> {
  if (!force && alreadyMigrated(db)) {
    return {
      migrated: false,
      reason: 'already-migrated',
      defs: 0,
      instsFinished: 0,
      instsRunning: 0,
      tasks: 0,
      actors: 0,
      events: 0,
    }
  }

  // ── 先把老库数据全部读出（异步，事务外）。事务内只做同步 SQLite 写。──
  log('读取旧 procdef…')
  const procdefs = await source.procdefs()
  log(`旧 procdef ${procdefs.length} 条`)

  log('读取旧 proc_inst（含历史表）…')
  const insts = await source.procInsts()
  log(`旧实例 ${insts.length} 条，逐条拉取执行流/任务/参与人…`)

  // 预拉每个实例的关联数据（事务内不能 await）。
  const instBundles: Array<{
    inst: (typeof insts)[number]
    execution: Awaited<ReturnType<LegacySource['executionByInst']>>
    tasks: Awaited<ReturnType<LegacySource['tasksByInst']>>
    identitylinks: Awaited<ReturnType<LegacySource['identitylinksByInst']>>
  }> = []
  let pulled = 0
  for (const inst of insts) {
    const [execution, tasks, identitylinks] = await Promise.all([
      source.executionByInst(inst.id),
      source.tasksByInst(inst.id),
      source.identitylinksByInst(inst.id),
    ])
    instBundles.push({ inst, execution, tasks, identitylinks })
    if (++pulled % 50 === 0)
      log(`已拉取 ${pulled}/${insts.length} 个实例的关联数据`)
  }

  const result: MigrationResult = {
    migrated: true,
    defs: 0,
    instsFinished: 0,
    instsRunning: 0,
    tasks: 0,
    actors: 0,
    events: 0,
  }

  // ── 单事务写入（原子）。──
  const tx = db.transaction(() => {
    // 1) procdef → proc_def，记录 旧 id → 新 id 映射。
    const defIdMap = new Map<number, { newId: number; version: number }>()
    const insDef = db.prepare(
      `INSERT INTO proc_def
         (name, category, icon, form_schema, flow_nodes, start_scope, version, status, sort_order, created_by, created_at)
       VALUES (@name, @category, @icon, @form_schema, @flow_nodes, NULL, @version, 'enabled', @sort, @created_by, @created_at)`,
    )
    for (const pd of procdefs) {
      const flow = convertResourceToFlow(pd.resource)
      const { category, schema } = inferCategoryAndSchema(pd.name)
      const info = insDef.run({
        name: pd.name,
        category,
        icon: null,
        form_schema: JSON.stringify(schema),
        flow_nodes: JSON.stringify(flow ?? {}),
        version: pd.version || 1,
        sort: pd.id,
        created_by: parseInt(pd.userid || '0', 10) || 0,
        created_at: pd.created_time || pd.deploy_time || nowStr(),
      })
      defIdMap.set(pd.id, {
        newId: info.lastInsertRowid as number,
        version: pd.version || 1,
      })
      result.defs++
    }
    log(`proc_def 写入 ${result.defs} 条`)

    // 预备语句。
    const insInst = db.prepare(
      `INSERT INTO proc_inst
         (def_id, def_version, title, form_data, initiator_id, dept_id, status,
          state, node_sequence, cur_node_seq_idx, cur_node_id, created_at, updated_at, finished_at)
       VALUES (@def_id, @def_version, @title, @form_data, @initiator_id, @dept_id, @status,
          @state, @node_sequence, @cur_node_seq_idx, @cur_node_id, @created_at, @updated_at, @finished_at)`,
    )
    const insTask = db.prepare(
      `INSERT INTO proc_task
         (inst_id, node_id, node_seq_idx, node_name, approve_mode, assignee_id,
          total_approvers, pending_count, agree_count, is_finished, state, created_at)
       VALUES (@inst_id, @node_id, @node_seq_idx, @node_name, @approve_mode, @assignee_id,
          @total_approvers, @pending_count, @agree_count, @is_finished, @state, @created_at)`,
    )
    const insActor = db.prepare(
      `INSERT INTO proc_actor
         (inst_id, task_id, node_seq_idx, userid, role, action, comment, is_system, created_at)
       VALUES (@inst_id, @task_id, @node_seq_idx, @userid, @role, @action, @comment, @is_system, @created_at)`,
    )
    const insEvent = db.prepare(
      `INSERT INTO proc_event (inst_id, task_id, actor_id, action, remark, created_at)
       VALUES (@inst_id, @task_id, @actor_id, @action, @remark, @created_at)`,
    )

    // 2/3/4) 实例迁移。
    let n = 0
    for (const { inst, execution, tasks, identitylinks } of instBundles) {
      const defRef = defIdMap.get(inst.proc_def_id)
      // 找不到对应 def（老数据脏）→ 用 0 占位，仍迁实例以免丢历史。
      const defId = defRef?.newId ?? 0
      const defVersion = defRef?.version ?? 1

      const finished = isFinishedState(inst.state, inst.is_finished)
      const status = stateToStatus(inst.state)
      const seq = execution ? convertNodeInfos(execution.node_infos) : []
      // 进行中：指针取「最后一个未完成 task 的 step」；无则回退实例字段/0。
      const activeTask = tasks.find(
        (t) => !(t.is_finished === 1 || t.is_finished === true),
      )
      const curIdx = finished
        ? seq.length // 已结束：指针落到末尾
        : stepToSeqIdx(activeTask ? activeTask.step : 0)
      const curNode = seq.at(curIdx)?.nodeId ?? (inst.node_id || null)

      const instInfo = insInst.run({
        def_id: defId,
        def_version: defVersion,
        title: inst.title || inst.proc_def_name || `实例#${inst.id}`,
        form_data: JSON.stringify(varToFormData(inst.var)),
        initiator_id: parseInt(inst.start_user_id || '0', 10) || 0,
        dept_id: inst.department_id || null,
        status,
        state: inst.state,
        node_sequence: JSON.stringify(seq),
        cur_node_seq_idx: curIdx,
        cur_node_id: curNode,
        created_at: inst.start_time || nowStr(),
        updated_at: inst.end_time || inst.start_time || nowStr(),
        finished_at: finished ? inst.end_time || null : null,
      })
      const newInstId = instInfo.lastInsertRowid as number
      if (finished) result.instsFinished++
      else result.instsRunning++

      // 发起事件（时间线起点）。
      insEvent.run({
        inst_id: newInstId,
        task_id: null,
        actor_id: parseInt(inst.start_user_id || '0', 10) || 0,
        action: 'submit',
        remark: null,
        created_at: inst.start_time || nowStr(),
      })

      // proc_task：每个旧 task → 一条（step==0 的 starter task 跳过，新引擎无显式 start task）。
      for (const t of tasks) {
        if (stepToSeqIdx(t.step) === 0) continue // starter 自动节点，不建 task
        const isFin = t.is_finished === 1 || t.is_finished === true
        const total = t.member_count > 0 ? t.member_count : 1
        // 旧 un_complete_num=待审计数；agree_num=已同意数。
        const pending = isFin ? 0 : Math.max(t.un_complete_num, 0)
        const seqIdx = stepToSeqIdx(t.step)
        const node = seq.at(seqIdx)
        insTask.run({
          inst_id: newInstId,
          node_id: t.node_id || node?.nodeId || '',
          node_seq_idx: seqIdx,
          node_name: node?.name ?? null,
          approve_mode: actTypeToMode(t.act_type),
          assignee_id: parseInt(t.assignee || '0', 10) || null,
          total_approvers: total,
          pending_count: pending,
          agree_count: Math.max(t.agree_num, 0),
          is_finished: isFin ? 1 : 0,
          // 已结束 task：拒绝单整体 reject → 该 task 视为 rejected，否则 approved。
          state: isFin
            ? inst.state === 3
              ? 'rejected'
              : 'approved'
            : 'pending',
          created_at: t.create_time || inst.start_time || nowStr(),
        })
        result.tasks++
      }

      // proc_actor + 时间线事件（从 identitylink 重建）。
      for (const il of identitylinks) {
        const { role, action, is_system } = identityToActor(il)
        insActor.run({
          inst_id: newInstId,
          task_id: null, // 旧 il.task_id 是老库 id，不映射到新 task；详情按 node_seq_idx 关联。
          node_seq_idx: stepToSeqIdx(il.step),
          userid: parseInt(il.user_id || '0', 10) || 0,
          role,
          action,
          comment: il.comment || null,
          is_system,
          created_at: inst.start_time || nowStr(),
        })
        result.actors++

        // 已处置（通过/拒绝/撤回）→ 重建一条时间线事件。
        const evAction = identityToEventAction(il.state)
        if (evAction && parseIds(il.user_id).length > 0) {
          insEvent.run({
            inst_id: newInstId,
            task_id: null,
            actor_id: parseInt(il.user_id || '0', 10) || 0,
            action: evAction,
            remark: il.comment || null,
            created_at: inst.end_time || inst.start_time || nowStr(),
          })
          result.events++
        }
      }

      if (++n % 50 === 0) log(`实例迁移进度 ${n}/${instBundles.length}`)
    }
    result.events += result.instsFinished + result.instsRunning // 计入 submit 事件
    log(
      `实例写入：结束 ${result.instsFinished} / 进行中 ${result.instsRunning}，task ${result.tasks}、actor ${result.actors}`,
    )

    // 5) 标记完成（同事务内，保证原子）。
    db.prepare(
      `INSERT INTO sys_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).run(SETTING_KEYS.migratedAt, nowStr())
  })

  tx()
  return result
}

function nowStr(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}
