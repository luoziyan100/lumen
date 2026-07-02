/** 内联 SVG 图标(stroke=currentColor,随按钮颜色走)。设计系统:不用 emoji。 */

export function PanelIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" />
    </svg>
  )
}

export function ChevronIcon({ open }: { open?: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform var(--dur-fast) var(--ease-out)' }}
    >
      <path d="M6 3.5 L10.5 8 L6 12.5" />
    </svg>
  )
}

export function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="7" cy="7" r="4.5" />
      <line x1="10.6" y1="10.6" x2="14" y2="14" />
    </svg>
  )
}
