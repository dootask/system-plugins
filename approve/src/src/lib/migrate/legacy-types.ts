/**
 * 旧 Go 工作流引擎（MySQL）表的只读行类型 + 数据源抽象。
 *
 * 列名为 gorm 默认下划线命名（见 .legacy-go/workflow-engine/model/*.go）。
 * 表前缀由 `${DB_PREFIX}approve_` 给出（如 `pre_approve_`）。
 *
 * 迁移**只读**老库：不 ALTER/DROP/INSERT 老表，所有写入都落到本插件 SQLite。
 *
 * LegacySource 抽象使迁移可被单测注入「内存假数据源」驱动，无需真连 MySQL。
 */

/** 旧 procdef（流程定义）行。resource = 流程树 JSON 字符串。 */
export interface LegacyProcdef {
  id: number
  name: string
  version: number
  resource: string
  userid: string
  username: string
  company: string
  deploy_time: string
  created_time: string
}

/** 旧 proc_inst / proc_inst_history 行（两表结构相同，合并读取）。 */
export interface LegacyProcInst {
  id: number
  proc_def_id: number
  proc_def_name: string
  title: string
  department_id: number
  department: string
  company: string
  node_id: string
  candidate: string
  task_id: number
  start_time: string
  end_time: string
  duration: number
  start_user_id: string
  start_user_name: string
  is_finished: number | boolean
  var: string
  /** 0待审/1审批中/2通过/3拒绝/4撤回。 */
  state: number
  latest_comment: string
  global_comment: string
}

/** 旧 execution / execution_history 行（node_infos = 展开后的线性节点 JSON）。 */
export interface LegacyExecution {
  id: number
  proc_inst_id: number
  proc_def_id: number
  node_infos: string
  is_active: number
  start_time: string
}

/** 旧 task / task_history 行。 */
export interface LegacyTask {
  id: number
  node_id: string
  step: number
  proc_inst_id: number
  assignee: string
  create_time: string
  claim_time: string
  member_count: number
  un_complete_num: number
  agree_num: number
  /** and=会签 / or=或签。 */
  act_type: string
  is_finished: number | boolean
}

/** 旧 identitylink / identitylink_history 行。 */
export interface LegacyIdentitylink {
  id: number
  group: string
  type: string // candidate/participant/notifier/主管
  user_id: string
  user_name: string
  task_id: number
  step: number
  proc_inst_id: number
  company: string
  comment: string
  is_system: number
  /** 0待处理/1通过/2拒绝/3撤回。 */
  state: number
}

/** 旧引擎 Execution.node_infos 数组里的单个节点（见 flow/node.go NodeInfo）。 */
export interface LegacyNodeInfo {
  nodeId: string
  /** starter/approver/notifier/""（末尾 end 节点 type 为空，aproverType=end）。 */
  type: string
  aproverType?: string // start/approver/notifier/end
  settype?: number
  approver?: string
  aproverId?: string // 逗号分隔的 userid 串
  memberCount?: number
  level?: number
  actType?: string // and/or
  nodeUserList?: Array<{ name?: string; targetId?: string; type?: number }>
}

/**
 * 旧库只读数据源。real 实现连 MySQL（mysql-source.ts），测试注入内存假实现。
 * 所有方法只 SELECT。
 */
export interface LegacySource {
  procdefs: () => Promise<Array<LegacyProcdef>>
  procInsts: () => Promise<Array<LegacyProcInst>>
  /** 取某实例的执行流（含历史表回退）。 */
  executionByInst: (procInstId: number) => Promise<LegacyExecution | undefined>
  tasksByInst: (procInstId: number) => Promise<Array<LegacyTask>>
  identitylinksByInst: (
    procInstId: number,
  ) => Promise<Array<LegacyIdentitylink>>
  close: () => Promise<void>
}
