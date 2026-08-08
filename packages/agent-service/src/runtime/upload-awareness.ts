/**
 * [INPUT]: 无运行时依赖;消费 UploadRef(上传回执/协议字段)
 * [OUTPUT]: UploadRef / formatUploadAnnex / userContentForModel / parseUploads
 * [POS]: 上传知情(S4,见 doc/upload-awareness.md);rebuildThread 与 submit/continue 共用,
 *        保证落库的 display content 与喂给模型的附言可分离重建
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */

/** 本回合随 user 事件持久化的附件引用(人:chip / 机:附言) */
export interface UploadRef {
  /** 展示名(多为原始文件名) */
  name: string
  /** 工作区相对路径,如 papers/a.pdf */
  path: string
  /** 摄取抽出稿路径(如 docs/a.md);有则附言优先指向它 */
  extractPath?: string
}

const ANNEX_HEADER =
  '# 本回合上传的附件（已在会话工作区，可直接用工具读写；勿说「你没附上」或去找 img-N，除非本回合另附了图片）'

/** 按路径/抽出稿生成一行机读提示 */
export function hintForUpload(ref: UploadRef): string {
  const base = ref.path.split('/').pop() ?? ref.path
  const ext = (base.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
  if (ref.extractPath) {
    return `已抽出文本 → \`${ref.extractPath}\`（优先 read_file 该文件；原件 \`${ref.path}\`）`
  }
  if (ext === 'pdf') return `PDF：用 extract_pdf(source=\`${ref.path}\`) 读正文`
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    return `图片已落盘 \`${ref.path}\`；若本回合 images 字段有像素则视觉直接可见，否则 look_at_image / 说明路径`
  }
  if (['md', 'markdown', 'txt', 'html', 'htm', 'csv', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'tex', 'py', 'ts', 'js', 'sh'].includes(ext)) {
    return `文本：用 read_file(\`${ref.path}\`) 直接读`
  }
  if (['zip', 'tar', 'gz', 'tgz', '7z', 'rar'].includes(ext)) {
    return `压缩包原件，未做文本抽取；需要内容时先说明或解压后再读`
  }
  if (ext === 'docx') {
    return `docx 原件；若无抽出稿，告知用户抽取失败或改用其它可读格式`
  }
  return `原件已落盘，未做文本抽取；按扩展名选择工具，勿假装未见`
}

/** 机读附言(不进气泡文案;由 rebuild/首轮拼进模型 user.content) */
export function formatUploadAnnex(uploads: UploadRef[]): string {
  if (!uploads.length) return ''
  const lines = [ANNEX_HEADER]
  for (const u of uploads) {
    const label = u.name.trim() || u.path
    lines.push(`- \`${label}\` → \`${u.path}\`（${hintForUpload(u)}）`)
  }
  return lines.join('\n')
}

/** 用户可见正文 + 可选附言 → 喂给模型的 user.content */
export function userContentForModel(displayText: string, uploads?: UploadRef[]): string {
  const annex = uploads?.length ? formatUploadAnnex(uploads) : ''
  const body = displayText.trimEnd()
  if (!annex) return displayText
  if (!body) return annex
  return `${body}\n\n${annex}`
}

/** 从事件 payload 安全解析 uploads[] */
export function parseUploads(raw: unknown): UploadRef[] {
  if (!Array.isArray(raw)) return []
  const out: UploadRef[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const path = typeof o.path === 'string' ? o.path : ''
    const name = typeof o.name === 'string' ? o.name : path.split('/').pop() ?? ''
    if (!path) continue
    const extractPath = typeof o.extractPath === 'string' ? o.extractPath : undefined
    out.push({ name: name || path, path, ...(extractPath ? { extractPath } : {}) })
  }
  return out
}
