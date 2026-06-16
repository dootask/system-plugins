import type { MsgEntry } from '#/lib/i18n/messages/entry'

// 数据备份页词条。
export const backup = {
  'backup.title': { zh: '数据备份', en: 'Backup' },
  'backup.desc': {
    zh: '备份 / 还原 / 下载审批数据库与上传附件（附件由插件本地存储，随库一并打包成 zip）。',
    en: 'Back up / restore / download the approval database and uploaded attachments (attachments are stored locally by the plugin and packaged into the zip with the database).',
  },
  'backup.now': { zh: '立即备份', en: 'Back Up Now' },
  'backup.download': { zh: '下载', en: 'Download' },
  'backup.restore': { zh: '还原', en: 'Restore' },

  // 表格表头
  'backup.col.name': { zh: '备份名称', en: 'Backup File' },
  'backup.col.createdAt': { zh: '创建时间', en: 'Created At' },
  'backup.col.size': { zh: '大小', en: 'Size' },

  // 空状态
  'backup.empty.title': { zh: '暂无备份', en: 'No backups' },
  'backup.empty.hint': {
    zh: '点击「立即备份」创建第一个备份',
    en: 'Click “Back Up Now” to create the first backup',
  },

  // 确认 / 错误
  'backup.restore.confirm': {
    zh: '确认用「{name}」还原数据库？当前数据将被覆盖，且不可恢复。',
    en: 'Restore the database from “{name}”? Restoring will overwrite current data and cannot be undone.',
  },
  'backup.restore.confirmTitle': { zh: '还原数据', en: 'Confirm restore' },
  'backup.delete.confirm': {
    zh: '确认删除备份「{name}」？',
    en: 'Delete backup “{name}”?',
  },
  'backup.delete.confirmTitle': { zh: '删除备份', en: 'Delete backup' },
  'backup.loadFailed': { zh: '加载失败', en: 'Failed to load' },
  'backup.backupFailed': { zh: '备份失败', en: 'Backup failed' },
  'backup.downloadFailed': { zh: '下载失败', en: 'Download failed' },
  'backup.restoreFailed': { zh: '还原失败', en: 'Restore failed' },
  'backup.deleteFailed': { zh: '删除失败', en: 'Delete failed' },
} satisfies Record<string, MsgEntry>
