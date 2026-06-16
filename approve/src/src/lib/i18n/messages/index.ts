import { common } from '#/lib/i18n/messages/common'
import { shell } from '#/lib/i18n/messages/shell'
import { detail } from '#/lib/i18n/messages/detail'
import { lists } from '#/lib/i18n/messages/lists'
import { designer } from '#/lib/i18n/messages/designer'
import { form } from '#/lib/i18n/messages/form'
import { stats } from '#/lib/i18n/messages/stats'
import { backup } from '#/lib/i18n/messages/backup'
import { uiMisc } from '#/lib/i18n/messages/uiMisc'
import { server } from '#/lib/i18n/messages/server'
import { engine } from '#/lib/i18n/messages/engine'
import type { MsgEntry } from '#/lib/i18n/messages/entry'

// 全量词条目录：各域模块在此汇总。新增模块时 import 后并入下方对象即可。
// key 以「域.名」前缀命名，避免跨模块碰撞（展开合并后同名后者覆盖前者）。
export const messages = {
  ...common,
  ...shell,
  ...detail,
  ...lists,
  ...designer,
  ...form,
  ...stats,
  ...backup,
  ...uiMisc,
  ...server,
  ...engine,
} satisfies Record<string, MsgEntry>

export type MsgKey = keyof typeof messages

export type { MsgEntry } from '#/lib/i18n/messages/entry'
