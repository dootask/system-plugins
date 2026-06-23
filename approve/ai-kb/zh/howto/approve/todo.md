---
id: approve.todo.howto
title: 处理待办（批准 / 拒绝 / 退回）
type: howto
feature: approve
scope: end-user
locale: zh
aliases:
  - 怎么审批
  - 批准审批
  - 同意申请
  - 拒绝审批
  - 退回审批
  - 处理待办
  - 待我审批
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
  - 有分配给我的待办审批
negative:
  - 拒绝会让整张审批单立即终止，不会再往下走
  - 退回是把单子还给发起人改，不等于拒绝
last_verified: v1.7.90
---

# 处理待办（批准 / 拒绝 / 退回）

## 入口
- 「应用」→「审批」→「待处理」，看到分配给我的审批单（菜单旁有数量角标）
- 也可以从机器人卡片消息点「查看详情」直接进入

## 找到要处理的单子
- 列表可按标题关键词搜索、按状态筛选
- 点标题进入审批单详情

## 在详情页可做的操作
当你是当前待办人时，操作区会出现这些按钮：
- **批准**：同意并推进流程
- **拒绝**：一票否决，整单立即终止变「已拒绝」
- **退回**：退给发起人修改，发起人改完重新提交再续审，详见 [[approve.return-resubmit.howto]]
- **转交**：交给别人代审，详见 [[approve.transfer.howto]]
- **加签**：拉更多人一起审这一步，详见 [[approve.addsign.howto]]
- **仅评论**：只留言不改流转状态，详见 [[approve.comment.howto]]

操作时可在文本框填写审批意见，也可上传图片一起记录。

## 多人审批怎么算通过
取决于该节点的审批方式：或签（一人通过即可）、会签（需全部通过）、依次（按顺序逐个）。详见 [[approve.node.concept]]。

## 处理后
- 处理过的单子会出现在「已处理」里
- 流程推进或结束时，相关人会收到机器人通知，详见 [[approve.notify.concept]]

## 相关
- 流程节点与审批方式：[[approve.node.concept]]
- 审批单状态：[[approve.instance-status.concept]]
