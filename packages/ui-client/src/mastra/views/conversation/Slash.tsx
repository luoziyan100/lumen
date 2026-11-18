/**
 * [INPUT]: 当前任务技能 API、欢迎态按需准备、会话草稿与输入卡锚点、统一技能图标入口
 * [OUTPUT]: useSkillSlash：原斜杠过滤、键盘选择及技能正文插入
 * [POS]: 技能仅显式加入原会话草稿；迟到激活不覆盖新输入，不提交模型请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useT } from '../../../i18n/index.ts'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ManageSkillsIcon, SkillIcon } from '../../../components/icons'
import type { LumenApi, Identity, SkillInfo } from '../../data/client.ts'
import { conversationDraft } from './draft.ts'

export function useSkillSlash({ api, identity, text, anchor, onManage, prepareSession }: {
  api: LumenApi; identity: Identity; text: string; anchor: RefObject<HTMLFormElement | null>; onManage: () => void; prepareSession?: () => Promise<unknown>
}) {
  const { slash: T, chat: C } = useT()
  const store = conversationDraft(identity), filter = /^\/([^\s]*)$/.exec(text)?.[1]
  const [skills, setSkills] = useState<SkillInfo[]>([]), [highlight, setHighlight] = useState(0)
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false)
  const [box, setBox] = useState<{ left: number; width: number; bottom: number } | null>(null)
  const generation = useRef(0), choosing = useRef(false), open = filter !== undefined
  const query = filter?.toLowerCase() ?? ''
  const rows = skills.filter(skill => !query || `${skill.name} ${skill.description}`.toLowerCase().includes(query))
  useEffect(() => {
    const current = ++generation.current
    choosing.current = false; setBusy(false)
    if (!open) return
    setSkills([]); setLoading(true); setError('')
    void Promise.resolve(prepareSession?.()).then(() => api.skills(identity)).then(result => { if (current === generation.current) setSkills(result.skills) })
      .catch(error => { if (current === generation.current) setError(String(error)) })
      .finally(() => { if (current === generation.current) setLoading(false) })
    return () => { generation.current++ }
  }, [api, identity.topicId, identity.taskId, open, prepareSession])
  useEffect(() => setHighlight(0), [filter, skills])
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const rect = anchor.current?.getBoundingClientRect()
      if (rect) setBox({ left: rect.left + 12, width: Math.max(0, rect.width - 24), bottom: window.innerHeight - rect.top + 8 })
    }
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, anchor])
  async function pick(skill: SkillInfo) {
    if (choosing.current) return
    const original = store.getSnapshot().draft, current = generation.current
    choosing.current = true; setBusy(true); setError('')
    try {
      await prepareSession?.()
      const result = await api.activateSkill(identity, skill.name)
      if (current !== generation.current) return
      if (store.getSnapshot().draft === original) store.setText(result.content)
      else store.appendText(result.content)
      anchor.current?.querySelector('textarea')?.focus()
    } catch (error) { if (current === generation.current) setError(String(error)) }
    finally { if (current === generation.current) { choosing.current = false; setBusy(false) } }
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || event.nativeEvent.isComposing) return false
    if (event.key === 'Escape') { event.preventDefault(); store.setText(''); return true }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (rows.length) setHighlight(value => (value + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length)
      return true
    }
    if (event.key !== 'Enter' || event.shiftKey) return false
    event.preventDefault()
    const selected = rows[highlight]
    if (selected && !loading) void pick(selected)
    return true
  }
  const menu = open && box ? createPortal(<div className="skill-slash-menu glass-card" aria-label={T.label} aria-busy={loading || busy} style={box}>
    {error && <p role="alert">{error}</p>}
    <ul className="skill-slash-list" role="listbox" aria-label={C.skills}>
      {rows.map((skill, index) => <li key={`${skill.layer}:${skill.name}`}><button type="button" role="option" aria-selected={index === highlight} disabled={busy} className={`skill-slash-item${index === highlight ? ' is-active' : ''}`} onMouseEnter={() => setHighlight(index)} onClick={() => void pick(skill)}>
        <SkillIcon name={skill.name} /><span className="skill-slash-name">{skill.name}</span><span className="skill-slash-desc">{skill.description}</span>
      </button></li>)}
      {!rows.length && <li className="skill-slash-empty">{loading ? C.readingSkills : T.noMatch}</li>}
    </ul><div className="skill-slash-sep" />
    <button type="button" className="skill-slash-item skill-slash-manage" onClick={() => { store.setText(''); onManage() }}><ManageSkillsIcon /><span className="skill-slash-name">{C.manageSkills}</span></button>
  </div>, document.body) : null
  return { onKeyDown, menu }
}
