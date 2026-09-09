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
  'backup.upload': { zh: '上传备份', en: 'Upload Backup' },
  'backup.uploading': {
    zh: '上传校验中...',
    en: 'Uploading and validating...',
  },
  'backup.uploaded': {
    zh: '已导入备份：{name}',
    en: 'Backup imported: {name}',
  },
  'backup.uploadTooLarge': {
    zh: '备份文件不能超过 100MB',
    en: 'Backup files must not exceed 100MB.',
  },
  'backup.invalidFile': {
    zh: '无效或不兼容的审批备份，请选择审批中心生成的 ZIP 或 DB 文件',
    en: 'Invalid or incompatible approval backup. Select a ZIP or DB file created by Approval Center.',
  },
  'backup.expandedTooLarge': {
    zh: '备份解压后不能超过 512MB 或 10000 个文件',
    en: 'Expanded backups must not exceed 512MB or 10,000 files.',
  },
  'backup.busy': {
    zh: '另一项备份操作正在进行，请稍后重试',
    en: 'Another backup operation is in progress. Try again later.',
  },
  'backup.operationFailed': {
    zh: '备份操作失败，请检查服务器日志后重试',
    en: 'Backup operation failed. Check the server logs and try again.',
  },
  'backup.rollbackFailed': {
    zh: '还原失败且自动回滚未完成，请使用还原前生成的安全备份恢复，并检查服务器日志',
    en: 'Restore failed and automatic rollback did not complete. Use the safety backup created before restoring and check the server logs.',
  },
  'backup.restored': {
    zh: '还原完成。还原前的安全备份：{name}',
    en: 'Restore completed. Safety backup: {name}',
  },

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
    zh: '确认用「{name}」还原？当前数据库和附件将被覆盖（旧版 DB 文件仅覆盖数据库）。还原前将自动生成安全备份，请在无人操作审批时执行。',
    en: 'Restore from “{name}”? This overwrites the current database and attachments (legacy DB files replace only the database). A safety backup will be created first. Restore when no one is using approvals.',
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
