/**
 * [INPUT]: 新建项目、长文本披露、外链门禁与图表修复的产品文案
 * [OUTPUT]: CREATE_PROJECT_COPY / MSG_FOLD_COPY / APP_STATUS_COPY / MERMAID_COPY
 * [POS]: 现役共享组件的文案边界；工作台与原生任务文案归 mastraCopy
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const CREATE_PROJECT_COPY = {
  title: '创建项目',
  nameLabel: '项目名称',
  namePlaceholder: '项目名称',
  folderLabel: '源文件夹',
  folderHint: '添加 Lumen 可读取的本地文件夹(可选)',
  folderChosen: '已选择',
  folderClear: '清除',
  folderPaste: '或粘贴路径…',
  cancel: '取消',
  submit: '创建项目',
} as const

export const MSG_FOLD_COPY = {
  expand: '展开全文',
  collapse: '收起',
} as const

export const APP_STATUS_COPY = {
  linkDialogTitle: '打开外部链接',
  linkDialogHint: '将离开 Lumen 访问：',
  linkDialogDontAsk: (host: string) => `不再询问 ${host} 的链接`,
  linkDialogCancel: '取消',
  linkDialogOpen: '打开链接',
} as const

export const MERMAID_COPY = {
  repair: '尝试修复',
  repairing: '修复中…',
  repairFailed: '自动修复未成功',
  repairedHint: '图已在本地修正（历史消息正文未改）',
} as const
