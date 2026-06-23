---
id: approve.backup.howto
title: 备份与恢复审批数据
type: howto
feature: approve
scope: admin
locale: zh
aliases:
  - 审批备份
  - 数据备份
  - 恢复审批数据
  - 下载备份
  - 删除备份
related_tools: []
related_pages: [application]
prerequisites:
  - 应用市场已安装 approve 插件
  - 当前用户是管理员
negative:
  - 「数据备份」仅管理员可见
  - 恢复会覆盖当前全部审批数据，操作不可逆，有二次确认
last_verified: v1.7.90
---

# 备份与恢复审批数据

## 入口
- 「应用」→「审批」→「数据备份」（仅管理员可见）

## 能做什么
- **立即备份**：点按钮生成一个备份包（含审批数据库快照 + 所有上传的附件）
- **下载备份**：把备份包下载到本地保存
- **恢复备份**：用某个备份覆盖当前数据（有二次确认）
- **删除备份**：删除不再需要的备份包（有二次确认）

## 备份列表
列表显示每个备份的文件名、创建时间、大小，按时间从新到旧排列。

## 恢复注意
- 恢复会用所选备份**整体覆盖**当前的审批数据和附件，当前数据将被替换
- 操作不可逆，恢复前建议先做一次当前数据的备份
- 恢复后审批数据回到备份时刻的状态

## 相关
- 旧版数据迁移：[[approve.migrate.howto]]
- 插件元信息：[[approve.plugin.concept]]
