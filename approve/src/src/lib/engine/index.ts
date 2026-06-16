/** 审批引擎对外入口。 */
export { createEngine, Engine } from './engine'
export type { EngineDeps } from './engine'
export { EngineError } from './errors'
export { expandFlow, collectRoleIds, validateFlowTree } from './flow'
export type {
  FlowNode,
  ConditionBranch,
  Condition,
  ExpandContext,
  LeaderResolver,
  RoleResolver,
} from './flow'
export { advanceSnapshot } from './shadow'
export type {
  RuntimeSnapshot,
  TaskSnapshot,
  ActorSnapshot,
  SnapshotAction,
} from './shadow'
export { nodeFinished, isAutoPass, nextPendingIdx } from './core'
export * from './types'
