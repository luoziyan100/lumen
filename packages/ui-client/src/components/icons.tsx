/**
 * [INPUT]: yan-design-system/icons 的几何(静态常量 SVG 标记)与 React ref；doc/ui-design.md §3.1 的纯线条、尺寸、动效和操作语义
 * [OUTPUT]: currentColor 纯线条的操作、文件类别与 Kumo 菜单图标(兼容 Phosphor Icon 类型)，ICON_SM/MD/LG
 * [POS]: 业务图标唯一入口；同一包装约束 JSX 与菜单引用，文件类别映射不含格式文字徽标
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { forwardRef } from 'react'
import type { Icon, IconProps } from '@phosphor-icons/react'
import { GLYPHS, type GlyphName } from 'yan-design-system/icons'

// ---- 16 行内 / 18 文件与按钮 / 20 主导航 ----
export const ICON_SM = 16
export const ICON_MD = 18
export const ICON_LG = 20

/** Kumo 菜单按 Phosphor 的 Icon 类型收组件；这里接受同一组 props，只取尺寸、样式与镜像。 */
function makeIcon(name: GlyphName, defaultSize = ICON_MD): Icon {
  return forwardRef<SVGSVGElement, IconProps>(({ size = defaultSize, className = '', mirrored, style, weight: _w, color: _c, alt: _a, children: _ch, ...props }, ref) => (
    <svg {...props} ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" className={`lumen-icon li li-${name} ${className}`.trim()}
      style={mirrored ? { ...style, transform: `${style?.transform ?? ''} scaleX(-1)`.trim() } : style} aria-hidden="true" focusable="false"
      dangerouslySetInnerHTML={{ __html: GLYPHS[name] }} />
  )) as Icon
}

// ---- 操作：相同语义在各区域使用同一个轮廓 ----
export const PanelIcon = makeIcon('panel', ICON_LG)
export const SearchIcon = makeIcon('search', ICON_LG)
export const AccountIcon = makeIcon('user', ICON_LG)
export const ChatIcon = makeIcon('chat', ICON_LG)
export const NewProjectIcon = makeIcon('plus', ICON_LG)
export const FoldersIcon = makeIcon('folders')
export const PlusIcon = makeIcon('plus')
export const MinusIcon = makeIcon('minus')
export const SendIcon = makeIcon('send')
export const StopIcon = makeIcon('stop')
export const MoreIcon = makeIcon('more')
export const GearIcon = makeIcon('gear')
export const BackIcon = makeIcon('caretLeft')
export const CloseIcon = makeIcon('close')
export const FileTextIcon = makeIcon('fileText')
export const ArrowDownIcon = makeIcon('arrowDown')
export const PlayIcon = makeIcon('play', ICON_SM)
export const TrashIcon = makeIcon('trash', ICON_SM)
export const CopyIcon = makeIcon('copy', ICON_SM)
export const OpenOutIcon = makeIcon('openOut', ICON_SM)
export const ArchiveIcon = makeIcon('archive')
export const CheckIcon = makeIcon('check', ICON_SM)
export const ChevronDownIcon = makeIcon('caretDown', ICON_SM)
export const ChevronUpIcon = makeIcon('caretUp', ICON_SM)
export const ExpandIcon = makeIcon('expand', ICON_SM)
export const ZoomInIcon = makeIcon('zoomIn', ICON_SM)
export const ZoomOutIcon = makeIcon('zoomOut', ICON_SM)
export const ManageSkillsIcon = makeIcon('briefcase', ICON_SM)

/** 右面板与左侧栏使用同一轮廓镜像，保持两侧导航对称。 */
export function RailIcon({ size = ICON_LG }: { size?: number }) {
  return <PanelIcon size={size} mirrored />
}

const ClosedFolderIcon = makeIcon('folder')
const OpenFolderIcon = makeIcon('folderOpen')

/** 目录开合共用图标家族，保留同一槽位内的交叉淡入。 */
export function FolderIcon({ size = ICON_MD, open = false }: { size?: number; open?: boolean }) {
  return <span className={`folder-glyph${open ? ' is-open' : ''}`} style={{ width: size, height: size }} aria-hidden>
    <span className="folder-glyph-closed"><ClosedFolderIcon size={size} /></span>
    <span className="folder-glyph-open"><OpenFolderIcon size={size} /></span>
  </span>
}

/** 标题右侧：展开朝下，收起朝右；只表示折叠，不兼任管理菜单。 */
export function SectionChevronIcon({ open }: { open?: boolean }) {
  return <ChevronDownIcon style={{ transform: open ? undefined : 'rotate(-90deg)', transition: 'transform var(--dur-collapse-in) var(--ease-spring)' }} />
}

const RightChevronIcon = makeIcon('caretRight', ICON_SM)

/** 树与详情左侧：展开向下，收起向右。 */
export function ChevronIcon({ open }: { open?: boolean }) {
  return <RightChevronIcon style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform var(--dur-collapse-in) var(--ease-spring)' }} />
}

// ---- 文件：轮廓表达类别；具体格式由文件名与阅读器标签表达 ----
const DocumentGlyph = makeIcon('fileText')
const CodeGlyph = makeIcon('fileCode')
const ImageGlyph = makeIcon('fileImage')
const ArchiveFileGlyph = makeIcon('fileArchive')
const TableGlyph = makeIcon('table')
const PresentationGlyph = makeIcon('presentation')
const AudioGlyph = makeIcon('fileAudio')
const VideoGlyph = makeIcon('fileVideo')
export const FileGlyph = makeIcon('file')
const FILE_GLYPHS: Record<string, Icon> = {
  pdf: DocumentGlyph, md: DocumentGlyph, txt: DocumentGlyph, tex: DocumentGlyph, epub: DocumentGlyph,
  doc: DocumentGlyph, docx: DocumentGlyph, rtf: DocumentGlyph,
  html: CodeGlyph, htm: CodeGlyph, json: CodeGlyph, css: CodeGlyph, js: CodeGlyph, jsx: CodeGlyph,
  ts: CodeGlyph, tsx: CodeGlyph, py: CodeGlyph, xml: CodeGlyph, yaml: CodeGlyph, yml: CodeGlyph,
  png: ImageGlyph, jpg: ImageGlyph, jpeg: ImageGlyph, webp: ImageGlyph, gif: ImageGlyph, svg: ImageGlyph,
  zip: ArchiveFileGlyph, gz: ArchiveFileGlyph, tar: ArchiveFileGlyph, '7z': ArchiveFileGlyph, rar: ArchiveFileGlyph,
  csv: TableGlyph, tsv: TableGlyph, xls: TableGlyph, xlsx: TableGlyph,
  ppt: PresentationGlyph, pptx: PresentationGlyph,
  mp3: AudioGlyph, wav: AudioGlyph, m4a: AudioGlyph,
  mp4: VideoGlyph, mov: VideoGlyph, webm: VideoGlyph,
}

export function FileTypeIcon({ name, size = ICON_MD }: { name: string; size?: number }) {
  const ext = (name.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
  const Glyph = FILE_GLYPHS[ext] ?? FileGlyph
  return <Glyph size={size} />
}

// ---- 菜单：保留 Kumo 的 Icon ref 合同，同样固定轮廓和颜色 ----
export const PaperclipGlyph = makeIcon('paperclip', ICON_SM)
export const BriefcaseGlyph = makeIcon('briefcase', ICON_SM)
export const GearGlyph = makeIcon('gear', ICON_SM)
export const SkillGlyph = makeIcon('scroll', ICON_SM)
export const ArchiveGlyph = makeIcon('archive', ICON_SM)
export const PencilGlyph = makeIcon('pencil', ICON_SM)
export const RefreshGlyph = makeIcon('refresh', ICON_SM)
export const FolderGlyph = makeIcon('folder', ICON_SM)
export const BrainGlyph = makeIcon('brain', ICON_SM)
const BookGlyph = makeIcon('book', ICON_SM)
const CalendarGlyph = makeIcon('calendar', ICON_SM)
const PaletteGlyph = makeIcon('palette', ICON_SM)
const StackGlyph = makeIcon('stack', ICON_SM)
const WrenchGlyph = makeIcon('wrench', ICON_SM)
const QuestionGlyph = makeIcon('question', ICON_SM)
const SearchGlyph = makeIcon('search', ICON_SM)
const ScriptGlyph = makeIcon('code', ICON_SM)

const SKILL_GLYPHS: readonly [RegExp, Icon][] = [
  [/paper|read|pdf|doc|journal|arxiv/, BookGlyph],
  [/schedul|calendar|cron|remind|time/, CalendarGlyph],
  [/design|ui|visual|draw|palette/, PaletteGlyph],
  [/memory|remember|consolidat/, BrainGlyph],
  [/context|stack|window/, StackGlyph],
  [/setup|install|config|cowork|init/, WrenchGlyph],
  [/explain|usage|help|how|faq/, QuestionGlyph],
  [/search|web|fetch|find|lookup/, SearchGlyph],
  [/code|script|run|exec/, ScriptGlyph],
]

/** 技能名称只决定语义，轮廓规范始终由统一包装决定。 */
export function skillGlyphForName(name: string): Icon {
  return SKILL_GLYPHS.find(([pattern]) => pattern.test(name.toLowerCase()))?.[1] ?? SkillGlyph
}

export function SkillIcon({ name, size = ICON_SM }: { name: string; size?: number }) {
  const Glyph = skillGlyphForName(name)
  return <Glyph size={size} />
}
