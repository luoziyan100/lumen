/**
 * [INPUT]: yan-design-system/icons geometry (static SVG markup) and React refs; doc/ui-design.md §3.1 rules for pure strokes, sizes, motion and action meaning
 * [OUTPUT]: currentColor stroke icons for actions, view navigation (Reading · Board · Takeaways · Concept map · Ideas · All), file kinds and Kumo menus (Phosphor Icon compatible), ICON_SM/MD/LG
 * [POS]: the only entry for product icons; one wrapper constrains JSX and menu use alike, and file kinds carry no format-text badges
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { forwardRef } from 'react'
import type { Icon, IconProps } from '@phosphor-icons/react'
import { GLYPHS, type GlyphName } from 'yan-design-system/icons'

// ---- 16 inline / 18 files and buttons / 20 main navigation ----
export const ICON_SM = 16
export const ICON_MD = 18
export const ICON_LG = 20

/** Kumo menus take Phosphor's Icon type, so the same props are accepted; only size, style and mirroring are used. */
function makeIcon(name: GlyphName, defaultSize = ICON_MD): Icon {
  return forwardRef<SVGSVGElement, IconProps>(({ size = defaultSize, className = '', mirrored, style, weight: _w, color: _c, alt: _a, children: _ch, ...props }, ref) => (
    <svg {...props} ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" className={`lumen-icon li li-${name} ${className}`.trim()}
      style={mirrored ? { ...style, transform: `${style?.transform ?? ''} scaleX(-1)`.trim() } : style} aria-hidden="true" focusable="false"
      dangerouslySetInnerHTML={{ __html: GLYPHS[name] }} />
  )) as Icon
}

// ---- Actions: one meaning keeps one outline everywhere ----
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
export const AttachIcon = makeIcon('paperclip')
export const PlayIcon = makeIcon('play', ICON_SM)
export const TrashIcon = makeIcon('trash', ICON_SM)
export const CopyIcon = makeIcon('copy', ICON_SM)
export const OpenOutIcon = makeIcon('openOut', ICON_SM)
export const ArchiveIcon = makeIcon('archive')
export const CheckIcon = makeIcon('check', ICON_SM)
export const ChevronDownIcon = makeIcon('caretDown', ICON_SM)
export const ChevronUpIcon = makeIcon('caretUp', ICON_SM)
export const ExpandIcon = makeIcon('expand', ICON_SM)
export const CollapseIcon = makeIcon('collapse', ICON_SM)
export const ZoomInIcon = makeIcon('zoomIn', ICON_SM)
export const ZoomOutIcon = makeIcon('zoomOut', ICON_SM)
export const ManageSkillsIcon = makeIcon('briefcase', ICON_SM)

// ---- View navigation, 16 inline ----
export const ReadingViewIcon = makeIcon('book', ICON_SM)
export const BoardViewIcon = makeIcon('presentation', ICON_SM)
export const SettledViewIcon = makeIcon('stack', ICON_SM)
export const MapViewIcon = makeIcon('conceptMap', ICON_SM)
export const IdeasViewIcon = makeIcon('lightbulb', ICON_SM)
export const AllViewIcon = makeIcon('grid', ICON_SM)

/** The right pane mirrors the left rail's outline so both sides stay symmetric. */
export function RailIcon({ size = ICON_LG }: { size?: number }) {
  return <PanelIcon size={size} mirrored />
}

const ClosedFolderIcon = makeIcon('folder')
const OpenFolderIcon = makeIcon('folderOpen')

/** Folder open/closed share one icon family so the slot can cross-fade. */
export function FolderIcon({ size = ICON_MD, open = false }: { size?: number; open?: boolean }) {
  return <span className={`folder-glyph${open ? ' is-open' : ''}`} style={{ width: size, height: size }} aria-hidden>
    <span className="folder-glyph-closed"><ClosedFolderIcon size={size} /></span>
    <span className="folder-glyph-open"><OpenFolderIcon size={size} /></span>
  </span>
}

/** Right of a title: down when open, right when folded; it means folding only, never a menu. */
export function SectionChevronIcon({ open }: { open?: boolean }) {
  return <ChevronDownIcon style={{ transform: open ? undefined : 'rotate(-90deg)', transition: 'transform var(--dur-collapse-in) var(--ease-spring)' }} />
}

const RightChevronIcon = makeIcon('caretRight', ICON_SM)

/** Left of trees and details: down when open, right when folded. */
export function ChevronIcon({ open }: { open?: boolean }) {
  return <RightChevronIcon style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform var(--dur-collapse-in) var(--ease-spring)' }} />
}

// ---- Files: the outline shows the kind; the exact format is in the name and the reader's label ----
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

// ---- Menus: keep Kumo's Icon ref contract with the same fixed outline and colour ----
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

/** A skill's name picks the meaning; the shared wrapper always sets the outline. */
export function skillGlyphForName(name: string): Icon {
  return SKILL_GLYPHS.find(([pattern]) => pattern.test(name.toLowerCase()))?.[1] ?? SkillGlyph
}

export function SkillIcon({ name, size = ICON_SM }: { name: string; size?: number }) {
  const Glyph = skillGlyphForName(name)
  return <Glyph size={size} />
}
