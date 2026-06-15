// 审批中心共享类型（前后端共用）。M0 仅含鉴权与用户展示相关类型，
// 业务模型（审批单 / 流程定义等）在后续阶段补充。
import type { FormSchema } from '#/lib/form/types'

/** 当前请求用户（由 auth.requireUser 反查主程序得到）。 */
export interface AuthUser {
  userId: number
  nickname: string
  email?: string
  /** 是否为插件配置的管理员（APPROVE_ADMIN_USER_IDS）。 */
  isAdmin: boolean
}

/** 用户展示信息（昵称解析结果）。 */
export interface UserLite {
  userid: number
  nickname: string
  email?: string
  /** 头像地址（主程序 userimg，可能为空）。 */
  avatar?: string
}

/**
 * 评论/审批意见附带的图片（存于 proc_event.attachments JSON）。
 * fileId 为主程序文件 id；url 为内容直链（评论时解析存储，便于前端 <img> 直接展示）。
 */
export interface CommentImage {
  fileId?: number
  name: string
  ext?: string
  size?: number
  url?: string
}

// ───────────────────────── 数据库行类型（repo 层返回） ─────────────────────────
// 形状与 lib/db.ts migrate() 的表列一一对应（SQLite 用 INTEGER 表布尔，0/1）。

/** proc_def 行（流程定义/模板）。 */
export interface ProcDefRow {
  id: number
  name: string
  category: string
  icon: string | null
  form_schema: string
  flow_nodes: string
  start_scope: string | null
  version: number
  status: string
  sort_order: number
  created_by: number
  created_at: string
  updated_at: string
}

/** proc_inst 行（流程实例，含同构运行时字段）。 */
export interface ProcInstRow {
  id: number
  def_id: number
  def_version: number
  title: string
  form_data: string
  initiator_id: number
  dept_id: number | null
  status: string
  state: number
  node_sequence: string
  cur_node_seq_idx: number
  cur_node_id: string | null
  created_at: string
  updated_at: string
  finished_at: string | null
}

/** proc_task 行（审批任务，承载会签计数）。 */
export interface ProcTaskRow {
  id: number
  inst_id: number
  node_id: string
  node_seq_idx: number
  node_name: string | null
  approve_mode: string
  assignee_id: number | null
  total_approvers: number
  pending_count: number
  agree_count: number
  is_finished: number
  state: string
  comment: string | null
  due_at: string | null
  acted_at: string | null
  created_at: string
}

/** proc_actor 行（参与人/抄送/加签）。 */
export interface ProcActorRow {
  id: number
  inst_id: number
  task_id: number | null
  node_seq_idx: number
  userid: number
  role: string
  action: string
  comment: string | null
  is_system: number
  created_at: string
}

/** proc_event 行（操作流水/时间线）。attachments 由 repo 从 JSON 列解析后给出。 */
export interface ProcEventRow {
  id: number
  inst_id: number
  task_id: number | null
  actor_id: number
  action: string
  remark: string | null
  /** 评论/意见附带的图片（解析自 attachments JSON 列）。 */
  attachments?: Array<CommentImage> | null
  created_at: string
}

/** proc_attachment 行（附件）。 */
export interface ProcAttachmentRow {
  id: number
  inst_id: number
  field_key: string | null
  file_id: number | null
  local_path: string | null
  name: string | null
  size: number | null
  ext: string | null
  uploaded_by: number
  created_at: string
}

// ───────────────────────── API 响应视图类型（前端用） ─────────────────────────

/** 列表项摘要（GET /api/insts 返回项）。 */
export interface InstSummary {
  id: number
  def_id: number
  title: string
  initiator_id: number
  status: string
  state: number
  cur_node_id: string | null
  created_at: string
  updated_at: string
  finished_at: string | null
}

/** 模板列表项（GET /api/defs）。 */
export interface DefSummary {
  id: number
  name: string
  category: string
  icon: string | null
  version: number
  sort_order: number
}

/** 审批单详情（GET /api/insts/:id）。 */
export interface InstDetail {
  inst: InstSummary & { def_version: number; dept_id: number | null }
  form_schema: FormSchema
  form_data: Record<string, unknown>
  events: Array<ProcEventRow>
  tasks: Array<ProcTaskRow>
  active_task: ProcTaskRow | null
  actors: Array<ProcActorRow>
  can_act: boolean
  is_initiator: boolean
}

/** proc_msg 行（待办-消息映射）。 */
export interface ProcMsgRow {
  id: number
  inst_id: number
  task_id: number | null
  userid: number
  dialog_id: number | null
  msg_id: number | null
  kind: string
  created_at: string
}
