---
id: approve.void.howto
title: 管理员作废未结束的审批
type: howto
feature: approve
scope: admin
locale: zh
aliases:
  - 作废审批
  - 管理员终止审批
  - 审批卡住怎么办
  - 清理重复申请
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
  - 当前用户是审批管理员
negative:
  - 作废不是物理删除，保留表单、附件和审批历史
  - 仅未结束的审批可作废，已通过、已拒绝、已撤回、已归档或已作废的审批不能再次作废
  - 作废后不能继续审批或重新提交
last_verified: v1.7.90
---

# 管理员作废未结束的审批

## 适用场景
未结束的异常审批、重复申请等确实不再需要继续流转时，由管理员终止流程，不清除审计记录。

## 操作步骤
1. 打开「应用」→「审批」→「审批管理」
2. 按标题或状态找到目标审批，打开详情
3. 点击「作废审批」，填写作废原因（去除首尾空白后 1–1000 字符）
4. 确认后审批转为「已作废」，未结束任务和待审参与人同时结束待办

## 作废后的数据
- 原表单、附件和已完成的审批历史保留，时间线记录操作人、时间与原因
- 相关用户仍可查看记录，具备查看权限的人仍可评论
- 已作废审批不计入数据统计与默认导出
- 需要审计时，可筛选「已作废」查询，并在导出中显式选择该状态

## 相关
- 审批状态：[[approve.instance-status.concept]]
- 删除审批单：[[approve.no-delete-inst.faq]]
- 导出：[[approve.export.howto]]
