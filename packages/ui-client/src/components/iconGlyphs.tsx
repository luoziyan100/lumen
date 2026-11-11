/**
 * [INPUT]: doc/ui-design.md §3.1 的 24 网格、纯线条与两帧动效合同
 * [OUTPUT]: GLYPHS —— 每个业务图标的 SVG 几何；`m-*` 为悬停时移动的部件，`solid` 为实心记号
 * [POS]: icons.tsx 的几何真源；动效位姿在 styles.css「图标动效」段按 `.li-<name> .m-*` 定义
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 *
 * 画法：描边由外层 svg 统一(1.5、圆头圆角、currentColor)，这里只写路径。不填充；
 * 前后重叠用断开的路径表达，不用底色遮挡。新增图标后须在明暗基线 16/18/20 实渲核对。
 */
import type { ReactElement } from 'react'

const GEAR = 'M18.53 10.49 L20.54 10.95 L20.54 13.05 L18.53 13.51 L17.68 15.55 L18.78 17.29 L17.29 18.78 L15.55 17.68 L13.51 18.53 L13.05 20.54 L10.95 20.54 L10.49 18.53 L8.45 17.68 L6.71 18.78 L5.22 17.29 L6.32 15.55 L5.47 13.51 L3.46 13.05 L3.46 10.95 L5.47 10.49 L6.32 8.45 L5.22 6.71 L6.71 5.22 L8.45 6.32 L10.49 5.47 L10.95 3.46 L13.05 3.46 L13.51 5.47 L15.55 6.32 L17.29 5.22 L18.78 6.71 L17.68 8.45 Z'
const PAGE = 'M7.5 3.5 H14 L18.5 8 V18.5 Q18.5 20.5 16.5 20.5 H7.5 Q5.5 20.5 5.5 18.5 V5.5 Q5.5 3.5 7.5 3.5 Z'
const FOLD = 'M14 3.5 V7 Q14 8 15 8 H18.5'
const LENS = <><circle cx="10.5" cy="10.5" r="6.25" /><path d="M15.2 15.2 L20 20" /></>

/** 文件类：纸页整体轻抬，内部记号另动 */
function page(marks: ReactElement | null): ReactElement {
  return <g className="m-page"><path d={PAGE} /><path d={FOLD} />{marks}</g>
}

export const GLYPHS = {
  // ---- 导航与操作 ----
  panel: <><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path className="m-divider" d="M9.5 4.5 V19.5" /></>,
  search: <g className="m-lens">{LENS}</g>,
  user: <><circle className="m-head" cx="12" cy="8.5" r="3.75" /><path d="M4.5 20 C5.5 16.3 8.4 14.5 12 14.5 C15.6 14.5 18.5 16.3 19.5 20" /></>,
  chat: <>
    <path className="m-bubble" d="M12 4 C16.7 4 20.5 7.4 20.5 11.6 C20.5 15.8 16.7 19.2 12 19.2 C10.8 19.2 9.6 19 8.6 18.6 L4.5 20 L5.6 16.3 C4.3 15 3.5 13.4 3.5 11.6 C3.5 7.4 7.3 4 12 4 Z" />
    <g className="m-typing"><circle className="solid" cx="8.6" cy="11.6" r="0.95" /><circle className="solid" cx="12" cy="11.6" r="0.95" /><circle className="solid" cx="15.4" cy="11.6" r="0.95" /></g>
  </>,
  plus: <path className="m-turn" d="M12 5 V19 M5 12 H19" />,
  minus: <path className="m-squeeze" d="M5 12 H19" />,
  close: <path className="m-turn" d="M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5" />,
  check: <path className="m-tick" d="M5 12.5 L10 17.5 L19 7" />,
  send: <g className="m-rise"><path d="M12 19.5 V5" /><path d="M6.5 10.5 L12 5 L17.5 10.5" /></g>,
  arrowDown: <g className="m-sink"><path d="M12 4.5 V19" /><path d="M6.5 13.5 L12 19 L17.5 13.5" /></g>,
  stop: <rect className="solid m-press" x="6" y="6" width="12" height="12" rx="2.5" />,
  more: <><circle className="solid m-dot1" cx="6" cy="12" r="1.4" /><circle className="solid m-dot2" cx="12" cy="12" r="1.4" /><circle className="solid m-dot3" cx="18" cy="12" r="1.4" /></>,
  gear: <g className="m-gear"><path d={GEAR} /><circle cx="12" cy="12" r="2.6" /></g>,
  caretLeft: <path className="m-left" d="M14.5 6 L8.5 12 L14.5 18" />,
  caretRight: <path className="m-right" d="M9.5 6 L15.5 12 L9.5 18" />,
  caretDown: <path className="m-sink" d="M6 9.5 L12 15.5 L18 9.5" />,
  caretUp: <path className="m-rise" d="M6 14.5 L12 8.5 L18 14.5" />,
  play: <path className="m-play" d="M8 5.6 V18.4 Q8 19.6 9.1 19 L18.6 13 Q19.6 12 18.6 11 L9.1 5 Q8 4.4 8 5.6 Z" />,
  trash: <>
    <path d="M6 8 L7 18.6 Q7.2 20.5 9.1 20.5 H14.9 Q16.8 20.5 17 18.6 L18 8" />
    <path d="M10.2 11.5 V17 M13.8 11.5 V17" />
    <g className="m-lid"><path d="M4 7.5 H20" /><path d="M9.5 7.5 V5.5 Q9.5 4 11 4 H13 Q14.5 4 14.5 5.5 V7.5" /></g>
  </>,
  copy: <>
    <path d="M15.5 8.5 H17.5 Q20 8.5 20 11 V17.5 Q20 20 17.5 20 H11 Q8.5 20 8.5 17.5 V15.5" />
    <rect className="m-fore" x="4" y="4" width="11.5" height="11.5" rx="2.5" />
  </>,
  openOut: <>
    <path d="M18 13.5 V17.5 Q18 20 15.5 20 H6.5 Q4 20 4 17.5 V8.5 Q4 6 6.5 6 H10.5" />
    <g className="m-out"><path d="M13.5 4 H20 V10.5" /><path d="M20 4 L11 13" /></g>
  </>,
  expand: <>
    <g className="m-out"><path d="M14.5 4 H20 V9.5" /><path d="M20 4 L14 10" /></g>
    <g className="m-in"><path d="M9.5 20 H4 V14.5" /><path d="M4 20 L10 14" /></g>
  </>,
  zoomIn: <><g className="m-lens">{LENS}</g><path className="m-turn" d="M8 10.5 H13 M10.5 8 V13" /></>,
  zoomOut: <><g className="m-lens">{LENS}</g><path className="m-squeeze" d="M8 10.5 H13" /></>,
  archive: <>
    <rect className="m-lid" x="3.5" y="4.5" width="17" height="4.5" rx="1.5" />
    <path d="M5 11 V18 Q5 20 7 20 H17 Q19 20 19 18 V11" /><path d="M10 13.5 H14" />
  </>,
  briefcase: <g className="m-lift">
    <rect x="3.5" y="7.5" width="17" height="12" rx="2.5" />
    <path className="m-handle" d="M9 7.5 V6 Q9 4.5 10.5 4.5 H13.5 Q15 4.5 15 6 V7.5" />
    <path d="M3.5 12.5 Q12 15.5 20.5 12.5" />
  </g>,
  pencil: <g className="m-write"><path d="M15.5 5.5 Q16.5 4.5 17.5 5.5 L18.5 6.5 Q19.5 7.5 18.5 8.5 L9 18 L5 19 L6 15 Z" /><path d="M13.5 7.5 L16.5 10.5" /></g>,
  refresh: <g className="m-spin"><path d="M19.5 12 A7.5 7.5 0 1 1 16.9 6.3" /><path d="M17.5 3 V7 H13.5" /></g>,
  paperclip: <path className="m-clip" d="M15.5 7.5 L8.75 14.25 A1.77 1.77 0 0 0 11.25 16.75 L18.25 9.75 A3.54 3.54 0 0 0 13.25 4.75 L6.25 11.75 A5.3 5.3 0 0 0 13.75 19.25 L19.5 13.5" />,
  // ---- 目录 ----
  folder: <>
    <path d="M3.5 11 V7 Q3.5 5 5.5 5 H9 L11 7 H18.5 Q20.5 7 20.5 9 V11" />
    <path className="m-sheet" d="M7 10 V9.5 Q7 9 7.5 9 H16.5 Q17 9 17 9.5 V10" />
    <path className="m-flap" d="M3.5 11 H20.5 V17 Q20.5 19 18.5 19 H5.5 Q3.5 19 3.5 17 Z" />
  </>,
  folderOpen: <>
    <path d="M3.5 17 V7 Q3.5 5 5.5 5 H9 L11 7 H16.5 Q18.5 7 18.5 9 V10.5" />
    <path className="m-flap" d="M3.5 19 L6.2 11.6 Q6.6 10.5 7.8 10.5 H20 Q21.3 10.5 20.9 11.7 L18.6 18 Q18.3 19 17.2 19 Z" />
  </>,
  folders: <>
    <path className="m-backFolder" d="M3 16 V6.5 Q3 4.5 5 4.5 H7.5 L9 6 H15.5 Q17.5 6 17.5 8 V8.5" />
    <path className="m-frontFolder" d="M5.5 10.5 Q5.5 8.5 7.5 8.5 H10 L11.5 10 H18.5 Q20.5 10 20.5 12 V18 Q20.5 20 18.5 20 H7.5 Q5.5 20 5.5 18 Z" />
  </>,
  // ---- 文件类别 ----
  file: page(null),
  fileText: page(<g className="m-rows"><path className="m-row1" d="M8.5 13 H15.5" /><path className="m-row2" d="M8.5 16.5 H13.5" /></g>),
  fileCode: page(<><path className="m-codeL" d="M10 12.5 L8 14.5 L10 16.5" /><path className="m-codeR" d="M14 12.5 L16 14.5 L14 16.5" /></>),
  fileImage: page(<><circle className="m-sun" cx="14.8" cy="11.6" r="1.1" /><path d="M8 17.5 L10.5 14.5 L12.4 16.4 L13.6 15.2 L16 17.5" /></>),
  fileArchive: page(<g className="m-zip"><path d="M10 3.5 V5 M10 6.5 V8 M10 9.5 V11" /><rect x="8.75" y="12.5" width="2.5" height="3.5" rx="0.8" /></g>),
  fileAudio: page(<g className="m-note"><circle cx="10.25" cy="16.25" r="1.5" /><path d="M11.75 16.25 V11.5 L14.75 12.5" /></g>),
  fileVideo: page(<path className="m-play" d="M10.5 12 V17 L14.5 14.5 Z" />),
  table: <>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="M3.5 10 H20.5" /><path className="m-row1" d="M3.5 14.5 H20.5" /><path className="m-col" d="M9.5 10 V19" />
  </>,
  presentation: <>
    <rect x="3.5" y="4.5" width="17" height="11" rx="1.5" />
    <path d="M12 15.5 V18 M8.5 20 L12 18 L15.5 20" />
    <path className="m-chart" d="M8 12 L10.5 9.5 L12.5 11.5 L16 8" />
  </>,
  // ---- 技能与菜单语义 ----
  scroll: <>
    <rect className="m-rollTop" x="5" y="3.5" width="14" height="3.5" rx="1.75" />
    <path d="M6.5 7 V17 M17.5 7 V17" />
    <g className="m-rows"><path className="m-row1" d="M9 10.25 H15" /><path className="m-row2" d="M9 13.5 H14" /></g>
    <rect className="m-rollBottom" x="5" y="17" width="14" height="3.5" rx="1.75" />
  </>,
  brain: <>
    <g className="m-lobeL"><path d="M12 6.4 Q11.2 4.6 9.2 4.8 Q7 5 6.7 7.2 Q4.6 7.7 4.7 10.1 Q3.8 11.8 5 13.3 Q4.6 15.7 6.7 16.6 Q7.4 19.2 10 19.1 Q11.4 19 12 17.9" /><path d="M8.2 10.2 Q9.8 10.1 10.2 8.5" /><path d="M8 14.4 Q9.6 13.6 10.6 14.6" /></g>
    <g className="m-lobeR"><path d="M12 6.4 Q12.8 4.6 14.8 4.8 Q17 5 17.3 7.2 Q19.4 7.7 19.3 10.1 Q20.2 11.8 19 13.3 Q19.4 15.7 17.3 16.6 Q16.6 19.2 14 19.1 Q12.6 19 12 17.9" /><path d="M15.8 10.2 Q14.2 10.1 13.8 8.5" /><path d="M16 14.4 Q14.4 13.6 13.4 14.6" /></g>
    <path d="M12 6.4 V17.9" />
  </>,
  book: <>
    <path className="m-pageL" d="M12 7 Q9.5 5 4 5.5 V18 Q9.5 17.5 12 19.5" />
    <path className="m-pageR" d="M12 7 Q14.5 5 20 5.5 V18 Q14.5 17.5 12 19.5" />
    <path d="M12 7 V19.5" />
  </>,
  calendar: <>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M4 10 H20" />
    <path className="m-rings" d="M8.5 3.5 V7 M15.5 3.5 V7" />
    <rect className="solid m-day" x="10.6" y="13.4" width="2.8" height="2.8" rx="0.7" />
  </>,
  palette: <>
    <path d="M12 4 C7.3 4 3.5 7.6 3.5 12 C3.5 16.4 7.3 20 12 20 C13.3 20 14 19.2 14 18.2 C14 17.4 13.4 16.9 13.4 16 C13.4 15 14.2 14.4 15.2 14.4 H17 C19 14.4 20.5 13 20.5 11 C20.5 7.1 16.7 4 12 4 Z" />
    <circle className="solid m-dot1" cx="7.8" cy="11.2" r="1.1" /><circle className="solid m-dot2" cx="10.2" cy="7.8" r="1.1" /><circle className="solid m-dot3" cx="14.4" cy="7.8" r="1.1" />
  </>,
  stack: <>
    <path className="m-layer1" d="M12 4 L20.5 8.5 L12 13 L3.5 8.5 Z" />
    <path className="m-layer2" d="M3.5 12 L12 16.5 L20.5 12" />
    <path d="M3.5 15.5 L12 20 L20.5 15.5" />
  </>,
  wrench: <path className="m-wrench" d="M14.5 6.5 L17.5 9.5 L20.6 6.4 A5.5 5.5 0 0 1 13.4 13.3 L7 19.7 A1.9 1.9 0 0 1 4.3 17 L10.7 10.6 A5.5 5.5 0 0 1 17.6 3.4 Z" />,
  question: <>
    <circle cx="12" cy="12" r="8.5" />
    <g className="m-ask"><path d="M9.6 9.7 Q9.8 7.5 12 7.5 Q14.4 7.5 14.4 9.6 Q14.4 11 12.9 11.7 Q12 12.1 12 13.2 V13.6" /><circle className="solid" cx="12" cy="16.5" r="1" /></g>
  </>,
  code: <><path className="m-codeL" d="M8.5 7.5 L4 12 L8.5 16.5" /><path className="m-codeR" d="M15.5 7.5 L20 12 L15.5 16.5" /></>,
} satisfies Record<string, ReactElement>

export type GlyphName = keyof typeof GLYPHS
