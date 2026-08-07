/**
 * [INPUT]: SkillInfo;SKILLS_COPY;skillSlash.parseSlashFilter(由父级传入 filter)
 * [OUTPUT]: SkillSlashMenu —— composer `/` 浮层:过滤 skills + Manage 入口
 * [POS]: ComposerCard 内绝对定位;选中即 activate,不插入文本等待模型再猜
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import type { SkillInfo } from '../agent-client'
import { SKILLS_COPY } from '../appCopy'
import { FileTextIcon, GearGlyph } from './icons'

export function SkillSlashMenu({
  skills,
  filter,
  highlight,
  onHighlight,
  onPickSkill,
  onManage,
}: {
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

  return (
    <div className="skill-slash-menu glass-card" role="listbox" aria-label="Skills">
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
              <FileTextIcon size={16} />
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
        <GearGlyph size={16} />
        <span className="skill-slash-name">{SKILLS_COPY.manageItem}</span>
      </button>
    </div>
  )
}
