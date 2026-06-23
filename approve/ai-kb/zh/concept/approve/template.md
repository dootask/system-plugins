---
id: approve.template.concept
title: 审批模板是什么
type: concept
feature: approve
scope: end-user
locale: zh
aliases:
  - 审批模板
  - 流程模板
  - 申请类型
  - 审批样板
  - 模板有哪些
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
negative:
  - 普通用户只能选用模板，不能编辑模板
  - 停用的模板不能再发起新申请，但已发起的审批单不受影响
last_verified: v1.7.90
---

# 审批模板是什么

## 定义
审批模板是管理员预先设计好的审批样板。发起人发起申请时先选一个模板，模板决定了「要填什么表单」和「按什么流程审批」。

## 模板的两部分
- **表单**：发起人需要填写的字段，如请假天数、报销金额、事由、附件等，详见 [[approve.form-field.concept]]
- **审批流程**：表单提交后按什么顺序、由谁审批，含审批节点、抄送节点、条件分支等，详见 [[approve.node.concept]]

## 分类
模板按用途归类，便于在发起页按页签筛选：
- **假勤**（如请假）
- **行政**（如加班）
- **财务**（如报销）
- **人事**（如差旅）
- **其他**（如评审）

## 内置模板
插件首次启动会自动生成一批内置模板，开箱即用。例如「报销」模板里就预置了按金额路由的条件分支：金额较大时自动多一级审批。

## 启用与停用
- 管理员可把模板设为「停用」，停用后发起页不再出现该模板，无法发起新申请
- 停用不影响已经发起的审批单，它们会按原流程继续走完

## 谁能管理模板
- 普通用户只能选用，不能改
- 管理员可在「模板管理」里新建、编辑、启停、删除模板，详见 [[approve.design-template.howto]]

## 相关
- 表单字段类型：[[approve.form-field.concept]]
- 流程节点：[[approve.node.concept]]
- 条件分支：[[approve.route.concept]]
- 怎么设计模板：[[approve.design-template.howto]]
