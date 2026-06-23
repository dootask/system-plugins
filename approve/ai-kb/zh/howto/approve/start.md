---
id: approve.start.howto
title: 发起一个审批
type: howto
feature: approve
scope: end-user
locale: zh
aliases:
  - 怎么发起审批
  - 提交申请
  - 申请请假
  - 提报销
  - 发起流程
  - 走个审批
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
  - 管理员已配置至少一个启用中的模板
negative:
  - 普通用户不能临时改流程或加字段，只能按模板填表
  - 选不到模板时通常是没有启用中的模板，或被管理员停用了
last_verified: v1.7.90
---

# 发起一个审批

## 入口
- 桌面端：左侧栏「应用」→「审批」→「发起申请」
- 移动端：底部 Tabbar「应用」→「审批」→「发起申请」

## 操作步骤
1. 进入「发起申请」，看到审批模板宫格
2. 按分类页签（假勤 / 行政 / 财务 / 人事 / 其他）筛选，或用搜索框按名称找模板
3. 点击要用的模板卡片，进入填表页
4. 按表单要求填写各字段（必填项不能空），需要时上传附件
5. 点提交；若有字段不合规会就地提示，改正后再提交
6. 提交成功后自动跳到该审批单详情页，可在「我发起」里随时回看

## 提交后会发生什么
- 系统按模板流程生成审批单，并把任务派给第一个审批节点的审批人
- 若模板含条件分支，会按你这次填的表单值确定走哪条路径，详见 [[approve.route.concept]]
- 审批人会收到机器人卡片通知，详见 [[approve.notify.concept]]

## 提交后你能做什么
- 在「我发起」查看进度与每一步的处理情况
- 无人处理前可以撤回，详见 [[approve.withdraw.howto]]
- 被退回时可修改表单重新提交，详见 [[approve.return-resubmit.howto]]
- 全程可在详情页补充评论，详见 [[approve.comment.howto]]

## 相关
- 表单字段：[[approve.form-field.concept]]
- 审批单状态：[[approve.instance-status.concept]]
