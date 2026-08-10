/**
 * [INPUT]: 无运行时依赖;消费 UploadRef / activePath(协议字段)
 * [OUTPUT]: UploadRef / formatUploadAnnex / formatActivePathAnnex / userContentForModel /
 *           parseUploads / sanitizeActivePath / isBindableActivePath
 * [POS]: 上传知情(S4)+产物闭环当前稿(见 briefs/active/artifact-loop-P0.md);
 *        rebuildThread 与 submit/continue 共用,落库 display content 与机读附言可分离重建
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

/** 拼装 user 机读 content 时的可选附言块 */
export interface UserContentAnnex {
  uploads?: UploadRef[]
  /** 已通过 sanitizeActivePath 的可写文本路径 */
  activePath?: string | null
}

/** 可绑为「当前稿」的文本扩展名(可 read_file + write/edit) */
const BINDABLE_TEXT_EXT = new Set([
  'md', 'markdown', 'txt', 'csv', 'json', 'jsonl', 'xml', 'yaml', 'yml', 'tex',
  'py', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'sh', 'css', 'html', 'htm', 'rs', 'go', 'java',
])

const ANNEX_HEADER =
  '# 本回合上传的附件（已在会话工作区，可直接用工具读写；勿说「你没附上」或去找 img-N，除非本回合另附了图片）'

const ACTIVE_PATH_HEADER = '# 当前稿'

/** 规范化工作区相对路径;非法返回 null */
export function normalizeWorkspaceRelPath(raw: string): string | null {
  let p = raw.trim().replace(/\\/g, '/')
  if (!p || p.includes('\0')) return null
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null
  const parts = p.split('/').filter((s) => s.length > 0 && s !== '.')
  if (parts.some((s) => s === '..')) return null
  p = parts.join('/')
  return p || null
}

function extOf(path: string): string {
  const base = path.split('/').pop() ?? path
  return (base.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
}

/**
 * 是否可绑为 active「当前稿」:
 * 可写文本扩展名;排除 shared/ 只读挂载、cache/ 内部物。
 */
export function isBindableActivePath(path: string): boolean {
  const p = normalizeWorkspaceRelPath(path)
  if (!p) return false
  if (p === 'shared' || p.startsWith('shared/')) return false
  if (p === 'cache' || p.startsWith('cache/')) return false
  if (p === 'library' || p.startsWith('library/')) return false
  const ext = extOf(p)
  if (!ext || !BINDABLE_TEXT_EXT.has(ext)) return false
  return true
}

/** 服务端/客户端共用:非法 activePath → null(不持久化、不拼附言) */
export function sanitizeActivePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const p = normalizeWorkspaceRelPath(raw)
  if (!p || !isBindableActivePath(p)) return null
  return p
}

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

/** 当前稿机读附言(path 须已 sanitize) */
export function formatActivePathAnnex(activePath: string): string {
  const p = sanitizeActivePath(activePath)
  if (!p) return ''
  return [
    ACTIVE_PATH_HEADER,
    `用户正在阅读或编辑工作区文件: \`${p}\``,
    '除非用户明确要求新建文件，修改/续写/润色应使用 edit_file（或 write_file 覆盖）指向该路径。',
  ].join('\n')
}

function resolveAnnex(uploadsOrAnnex?: UploadRef[] | UserContentAnnex): UserContentAnnex {
  if (!uploadsOrAnnex) return {}
  if (Array.isArray(uploadsOrAnnex)) return { uploads: uploadsOrAnnex }
  return uploadsOrAnnex
}

/** 用户可见正文 + 可选附言 → 喂给模型的 user.content */
export function userContentForModel(
  displayText: string,
  uploadsOrAnnex?: UploadRef[] | UserContentAnnex,
): string {
  const { uploads, activePath } = resolveAnnex(uploadsOrAnnex)
  const parts: string[] = []
  if (uploads?.length) {
    const a = formatUploadAnnex(uploads)
    if (a) parts.push(a)
  }
  if (activePath) {
    const a = formatActivePathAnnex(activePath)
    if (a) parts.push(a)
  }
  const annex = parts.join('\n\n')
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

/** 从 tool_call.args 解析 path(含 file_name 别名);旧 tool_result 回退用 */
export function pathFromToolArgs(args: unknown): string | null {
  if (!args || typeof args !== 'object') return null
  const o = args as Record<string, unknown>
  const raw = o.path ?? o.file_name ?? o.filename ?? o.file
  if (typeof raw !== 'string') return null
  const p = normalizeWorkspaceRelPath(raw)
  return p
}
