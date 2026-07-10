/** 图标唯一入口:一律 @phosphor-icons/react(Kumo 同源家族),经此单点 re-export。
 *  规范见 doc/ui-design.md「§3.1 图标规范」:三档尺寸 + weight 全站统一 regular;
 *  禁手写 SVG / 字符凑图标(← › × ＋) / emoji / 绕过本文件直接 import phosphor。 */
import { ArrowUp, CaretLeft, CaretRight, ChatCircle, Check, Copy, File, FileCode, FileCsv, FileDoc, FileHtml, FileImage, FilePdf, FilePpt, FileText, FileZip, Gear, MagnifyingGlass, Plus, SidebarSimple, User, X } from '@phosphor-icons/react'

// 尺寸三档:行内(列表/标签内) / 按钮内 / 导航按钮
export const ICON_SM = 16
export const ICON_MD = 18
export const ICON_LG = 20

export function PanelIcon({ size = ICON_LG }: { size?: number }) {
  return <SidebarSimple size={size} />
}

/** 工作区(右轨)收起/展开:右侧面板图标(SidebarSimple 水平镜像,与左侧栏折叠钮对称) */
export function RailIcon({ size = ICON_LG }: { size?: number }) {
  return <SidebarSimple size={size} style={{ transform: 'scaleX(-1)' }} />
}

export function SearchIcon({ size = ICON_LG }: { size?: number }) {
  return <MagnifyingGlass size={size} />
}

/** 新对话:聊天气泡(owner 定用 chat 图标,非加号) */
export function ChatIcon({ size = ICON_MD }: { size?: number }) {
  return <ChatCircle size={size} />
}

/* 以下两枚为 owner 指定的具体图标(非 phosphor 库内),经此单点收口:
   PdfIcon = 书本(替代工作区里 PDF 文字标);FoldersIcon = 文件夹,hover 微动(CSS 驱动,不引 framer)。 */

/** 工作区 PDF 文件标记:owner 指定书本图标(填充款) */
export function PdfIcon({ size = ICON_SM }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M232,48H160a40,40,0,0,0-32,16A40,40,0,0,0,96,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,24,8,8,0,0,0,16,0,24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM96,192H32V64H96a24,24,0,0,1,24,24V200A39.81,39.81,0,0,0,96,192Zm128,0H160a39.81,39.81,0,0,0-24,8V88a24,24,0,0,1,24-24h64Z" />
    </svg>
  )
}

/** 工作目录文件夹:hover 时前后层微动(CSS 见 styles.css .folders-*;不引 framer-motion) */
export function FoldersIcon({ size = ICON_MD }: { size?: number }) {
  return (
    <svg className="folders-ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="folders-back" d="M2 8v11a2 2 0 0 0 2 2h14" />
      <path className="folders-front" d="M20 17a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.9a2 2 0 0 1-1.69-.9l-.81-1.2a2 2 0 0 0-1.67-.9H8a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2Z" />
    </svg>
  )
}

export function PlusIcon({ size = ICON_MD }: { size?: number }) {
  return <Plus size={size} />
}

export function SendIcon({ size = ICON_MD }: { size?: number }) {
  return <ArrowUp size={size} />
}

export function GearIcon({ size = ICON_MD }: { size?: number }) {
  return <Gear size={size} />
}

export function BackIcon({ size = ICON_MD }: { size?: number }) {
  return <CaretLeft size={size} />
}

export function CloseIcon({ size = ICON_MD }: { size?: number }) {
  return <X size={size} />
}

/** 折叠展开指示:CaretRight 旋转(展开态转 90°) */
export function ChevronIcon({ open }: { open?: boolean }) {
  return (
    <CaretRight
      size={ICON_SM}
      style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform var(--dur-fast) var(--ease-out)' }}
    />
  )
}

/** 文件类型图标:按扩展名给工作目录列表配图标(替代文字小框,owner 定 2026-07-10)。
 *  全站 weight 统一 regular;未识别的类型退回通用 File。 */
export function FileTypeIcon({ name, size = ICON_MD }: { name: string; size?: number }) {
  const ext = (name.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
  switch (ext) {
    case 'pdf': return <FilePdf size={size} />
    case 'md': case 'txt': case 'tex': case 'epub': return <FileText size={size} />
    case 'html': case 'htm': return <FileHtml size={size} />
    case 'csv': return <FileCsv size={size} />
    case 'json': return <FileCode size={size} />
    case 'png': case 'jpg': case 'jpeg': case 'webp': case 'gif': return <FileImage size={size} />
    case 'docx': case 'doc': return <FileDoc size={size} />
    case 'pptx': case 'ppt': return <FilePpt size={size} />
    case 'zip': return <FileZip size={size} />
    default: return <File size={size} />
  }
}

/** 账户头像:User regular(轮廓款,owner 定;全站 weight 统一 regular,无例外) */
export function AccountIcon({ size = ICON_LG }: { size?: number }) {
  return <User size={size} />
}

/** 消息悬停操作:复制 / 已复制 */
export function CopyIcon({ size = ICON_SM }: { size?: number }) {
  return <Copy size={size} />
}

export function CheckIcon({ size = ICON_SM }: { size?: number }) {
  return <Check size={size} />
}
