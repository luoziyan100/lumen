/**
 * [INPUT]: Phosphor 图形与 React ref；doc/ui-design.md §3.1 的轮廓、尺寸和操作语义
 * [OUTPUT]: 固定 regular/currentColor 的操作、文件类别与 Kumo 菜单图标，ICON_SM/MD/LG
 * [POS]: 业务图标唯一入口；同一包装约束 JSX 与菜单引用，文件类别映射不含格式文字徽标
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { forwardRef } from 'react'
import {
  Archive, ArrowClockwise, ArrowDown, ArrowSquareOut, ArrowUp, ArrowsOut, BookOpen, Brain, Briefcase,
  CalendarBlank, CaretDown, CaretLeft, CaretRight, CaretUp, ChatCircle, Check, Code, Copy, DotsThree,
  File, FileArchive, FileAudio, FileCode, FileImage, FileText, FileVideo, FolderOpen, Folders, FolderSimple,
  Gear, MagnifyingGlass, MagnifyingGlassMinus, MagnifyingGlassPlus, Minus, Palette, Paperclip, PencilSimple,
  Play, Plus, Presentation, Question, Scroll, SidebarSimple, Square, Stack, Table, Trash, User, Wrench, X,
  type Icon, type IconProps,
} from '@phosphor-icons/react'

// ---- 16 行内 / 18 文件与按钮 / 20 主导航 ----
export const ICON_SM = 16
export const ICON_MD = 18
export const ICON_LG = 20

function makeIcon(Glyph: Icon, defaultSize = ICON_MD): Icon {
  return forwardRef<SVGSVGElement, IconProps>(({ size = defaultSize, className = '', ...props }, ref) => (
    <Glyph {...props} ref={ref} size={size} weight="regular" color="currentColor"
      className={`lumen-icon ${className}`.trim()} aria-hidden="true" focusable="false" />
  ))
}

// ---- 操作：相同语义在各区域使用同一个轮廓 ----
export const PanelIcon = makeIcon(SidebarSimple, ICON_LG)
export const SearchIcon = makeIcon(MagnifyingGlass, ICON_LG)
export const AccountIcon = makeIcon(User, ICON_LG)
export const ChatIcon = makeIcon(ChatCircle, ICON_LG)
export const NewProjectIcon = makeIcon(Plus, ICON_LG)
export const FoldersIcon = makeIcon(Folders)
export const PlusIcon = makeIcon(Plus)
export const MinusIcon = makeIcon(Minus)
export const SendIcon = makeIcon(ArrowUp)
export const StopIcon = makeIcon(Square)
export const MoreIcon = makeIcon(DotsThree)
export const GearIcon = makeIcon(Gear)
export const BackIcon = makeIcon(CaretLeft)
export const CloseIcon = makeIcon(X)
export const FileTextIcon = makeIcon(FileText)
export const ArrowDownIcon = makeIcon(ArrowDown)
export const PlayIcon = makeIcon(Play, ICON_SM)
export const TrashIcon = makeIcon(Trash, ICON_SM)
export const CopyIcon = makeIcon(Copy, ICON_SM)
export const OpenOutIcon = makeIcon(ArrowSquareOut, ICON_SM)
export const ArchiveIcon = makeIcon(Archive)
export const CheckIcon = makeIcon(Check, ICON_SM)
export const ChevronDownIcon = makeIcon(CaretDown, ICON_SM)
export const ChevronUpIcon = makeIcon(CaretUp, ICON_SM)
export const ExpandIcon = makeIcon(ArrowsOut, ICON_SM)
export const ZoomInIcon = makeIcon(MagnifyingGlassPlus, ICON_SM)
export const ZoomOutIcon = makeIcon(MagnifyingGlassMinus, ICON_SM)
export const ManageSkillsIcon = makeIcon(Briefcase, ICON_SM)

/** 右面板与左侧栏使用同一轮廓镜像，保持两侧导航对称。 */
export function RailIcon({ size = ICON_LG }: { size?: number }) {
  return <PanelIcon size={size} mirrored />
}

const ClosedFolderIcon = makeIcon(FolderSimple)
const OpenFolderIcon = makeIcon(FolderOpen)

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

const RightChevronIcon = makeIcon(CaretRight, ICON_SM)

/** 树与详情左侧：展开向下，收起向右。 */
export function ChevronIcon({ open }: { open?: boolean }) {
  return <RightChevronIcon style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform var(--dur-collapse-in) var(--ease-spring)' }} />
}

// ---- 文件：轮廓表达类别；具体格式由文件名与阅读器标签表达 ----
const DocumentGlyph = makeIcon(FileText)
const CodeGlyph = makeIcon(FileCode)
const ImageGlyph = makeIcon(FileImage)
const ArchiveFileGlyph = makeIcon(FileArchive)
const TableGlyph = makeIcon(Table)
const PresentationGlyph = makeIcon(Presentation)
const AudioGlyph = makeIcon(FileAudio)
const VideoGlyph = makeIcon(FileVideo)
export const FileGlyph = makeIcon(File)
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
export const PaperclipGlyph = makeIcon(Paperclip, ICON_SM)
export const BriefcaseGlyph = makeIcon(Briefcase, ICON_SM)
export const GearGlyph = makeIcon(Gear, ICON_SM)
export const SkillGlyph = makeIcon(Scroll, ICON_SM)
export const ArchiveGlyph = makeIcon(Archive, ICON_SM)
export const PencilGlyph = makeIcon(PencilSimple, ICON_SM)
export const RefreshGlyph = makeIcon(ArrowClockwise, ICON_SM)
export const FolderGlyph = makeIcon(FolderSimple, ICON_SM)
export const BrainGlyph = makeIcon(Brain, ICON_SM)
const BookGlyph = makeIcon(BookOpen, ICON_SM)
const CalendarGlyph = makeIcon(CalendarBlank, ICON_SM)
const PaletteGlyph = makeIcon(Palette, ICON_SM)
const StackGlyph = makeIcon(Stack, ICON_SM)
const WrenchGlyph = makeIcon(Wrench, ICON_SM)
const QuestionGlyph = makeIcon(Question, ICON_SM)
const SearchGlyph = makeIcon(MagnifyingGlass, ICON_SM)
const ScriptGlyph = makeIcon(Code, ICON_SM)

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
