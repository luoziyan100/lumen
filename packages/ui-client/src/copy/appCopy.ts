/**
 * [INPUT]: 新建项目、长文本披露、外链门禁与图表修复的产品文案
 * [OUTPUT]: CREATE_PROJECT_COPY / MSG_FOLD_COPY / APP_STATUS_COPY / MERMAID_COPY / mermaidFixPrompt
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
  askFix: '请模型修正',
  askedFix: '已发送修正请求',
} as const

/** 失败图以普通用户消息回到当前会话：带原图与解析错误，只要求重发这一张图 */
export function mermaidFixPrompt(source: string, error: string): string {
  return `上面回复里的这张 Mermaid 图无法渲染，解析错误：\n\n${error.trim().slice(0, 800)}\n\n请只重发修正后的这一张图，保持节点和关系不变，不要重写其他内容。\n\n\`\`\`mermaid\n${source}\n\`\`\``
}
