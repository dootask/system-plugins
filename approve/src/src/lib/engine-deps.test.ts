import { describe, expect, it } from 'vitest'
import { leaderTiers, type DeptRow } from './engine-deps'

// 组织结构（对齐真机）：人力行政部(1) ⊂ 总经办(342)；E2E部门(284) owner 阿胖 + 管理员[30,75,201]。
const D = (
  id: number,
  parent: number,
  owner: number,
  deputies: Array<number> = [],
): [number, DeptRow] => [
  id,
  { id, name: `d${id}`, parent_id: parent, owner_userid: owner, deputy_userids: deputies },
]
const byId = new Map<number, DeptRow>([
  D(1, 342, 280), // 人力行政部：负责人 贾晰雯(280)，父=总经办
  D(342, 0, 3), // 总经办：负责人 阿胖(3)
  D(284, 0, 3, [30, 75, 201]), // E2E：负责人 阿胖(3) + 管理员 30/75/201
])
const sorted = (xs: Array<number>) => [...xs].sort((a, b) => a - b)

describe('leaderTiers（上级负责人解析）', () => {
  it('员工多部门 → 各部门负责人并集（剔自己）', () => {
    // 王棉(75) ∈ 人力/总经办/E2E；E2E 她是管理员(同级)→跳过取其父；人力→贾、总经办→阿胖。
    const t = leaderTiers(byId, [1, 284, 342], 75)
    expect(sorted(t[0])).toEqual([3, 280])
  })

  it('部门负责人发起 → 上溯父部门（不取同级），修掉自审跳过', () => {
    // 贾晰雯(280) 是人力负责人 → 人力跳过取父(总经办)→ 阿胖。
    const t = leaderTiers(byId, [1], 280)
    expect(t[0]).toEqual([3])
  })

  it('多负责人（主负责人 + 部门管理员）全部纳入', () => {
    // 普通成员(999) ∈ E2E → owner 阿胖(3) + 管理员 30/75/201 全进。
    const t = leaderTiers(byId, [284], 999)
    expect(sorted(t[0])).toEqual([3, 30, 75, 201])
  })

  it('跨级去重 + 顶层无人返回空（自动通过）', () => {
    // 阿胖(3) 是总经办与 E2E 负责人 → 两个都跳过取父(均为顶)→ 无更上级 → 空。
    const t = leaderTiers(byId, [342, 284], 3)
    expect(t).toEqual([])
  })
})
