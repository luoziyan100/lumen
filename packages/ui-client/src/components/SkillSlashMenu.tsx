/**
 * [INPUT]: SkillInfo;SKILLS_COPY;skillSlash.parseSlashFilter / slashMenuBox;anchor 输入卡
 * [OUTPUT]: SkillSlashMenu —— composer `/` 浮层:过滤 skills + Manage 入口
 * [POS]: portal 到 document.body(fixed),锚 composer 卡顶;避开 BorderBeam overflow:hidden
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useLayoutEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { SkillInfo } from '../agent-client'
import { SKILLS_COPY } from '../copy/appCopy'
import { slashMenuBox, type SlashMenuBox } from '../composer/skillSlash'
import { ManageSkillsIcon, SkillIcon } from './icons'

export function SkillSlashMenu({
  anchorRef,
  skills,
  filter,
  highlight,
  onHighlight,
  onPickSkill,
  onManage,
}: {
  anchorRef: RefObject<HTMLElement | null>
  skills: SkillInfo[]
  filter: string
  highlight: number
  onHighlight: (i: number) => void
  onPickSkill: (s: SkillInfo) => void
  onManage: () => void
}) {
  const q = filter.trim().toLowerCase()
  const rows = skills.filter((s) => {
    if (!q) return true
    return s.name.includes(q) || s.description.toLowerCase().includes(q)
  })
  const [box, setBox] = useState<SlashMenuBox | null>(null)

  useLayoutEffect(() => {
    function place(): void {
      const el = anchorRef.current
      if (!el) return
      setBox(slashMenuBox(el.getBoundingClientRect(), window.innerHeight))
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchorRef])

  if (!box) return null

  return createPortal(
    <div
      className="skill-slash-menu glass-card"
      role="listbox"
      aria-label="Skills"
      style={{ left: box.left, width: box.width, bottom: box.bottom }}
    >
      <div className="skill-slash-hint">{SKILLS_COPY.slashFilter}</div>
      <ul className="skill-slash-list">
        {rows.map((s, i) => (
          <li key={`${s.layer}:${s.name}`}>
            <button
              type="button"
              role="option"
              aria-selected={i === highlight}
              className={`skill-slash-item${i === highlight ? ' is-active' : ''}`}
              onMouseEnter={() => onHighlight(i)}
              onClick={() => onPickSkill(s)}
            >
              <SkillIcon name={s.name} size={16} />
              <span className="skill-slash-name">{s.name}</span>
              <span className="skill-slash-desc">{s.description}</span>
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="skill-slash-empty">{SKILLS_COPY.empty}</li>
        )}
      </ul>
      <div className="skill-slash-sep" />
      <button type="button" className="skill-slash-item skill-slash-manage" onClick={onManage}>
        <ManageSkillsIcon size={16} />
        <span className="skill-slash-name">{SKILLS_COPY.manageItem}</span>
      </button>
    </div>,
    document.body,
  )
}
