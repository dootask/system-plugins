---
id: approve.no-delete-inst.faq
title: 能删除审批单吗
type: faq
feature: approve
scope: end-user
locale: zh
aliases:
  - 删除审批单
  - 怎么删审批
  - 删掉申请记录
  - 清除审批
  - 删除审批记录
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
negative:
  - 没有删除单张审批单的功能
  - 「删除」只针对模板，且需管理员操作
last_verified: v1.7.90
---

# 能删除审批单吗

## 问题
想把某张已发起的审批单删掉，找不到删除入口。

## 结论
审批中心**没有删除单张审批单**的功能。审批单一旦发起就会留下记录，保证审批可追溯。

## 可以做什么
- 发起人在无人处理前可以**撤回**正在进行的审批单，详见 [[approve.withdraw.howto]]
- 撤回 / 拒绝后的单子会保留为「已撤回 / 已拒绝」状态，不会从列表消失

## 「删除」是针对模板的
能被删除的是**审批模板**（管理员在「模板管理」里操作，有二次确认），删除模板不影响已经发起的审批单。详见 [[approve.design-template.howto]]。

## 相关
- 撤回审批：[[approve.withdraw.howto]]
- 设计 / 删除模板：[[approve.design-template.howto]]
- 审批单状态：[[approve.instance-status.concept]]
