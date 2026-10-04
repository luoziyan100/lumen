/**
 * [INPUT]: 原生消息投影的thought/process行、公开运行状态与共享CurtainFold
 * [OUTPUT]: ThoughtRow、ProcessRow、Waiting：原折叠思考、工具叙事、无正文等待态
 * [POS]: 开合为局部交互；Thought完成收起，Process只由用户切换，长轨迹仅露最近六步；等待与思考共享真实本轮起点，分秒计时，结束不报耗时
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react'
import { InlineLoader } from 'generative-loaders'
import 'generative-loaders/styles.css'
import { ThinkingOrb, type OrbState } from 'thinking-orbs'
import { CurtainFold } from '../../../../components/disclosure/CurtainFold'
import type { Row } from './project'
import './process.css'
export function formatElapsed(ms: number): string {
  const total = Math.max(0, ms / 1000)
  return total < 60 ? `${total.toFixed(1)}s` : `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`
}
function Elapsed({ startedAt, running }: { startedAt: Date | null; running: boolean }) {
  const [now, setNow] = useState(Date.now())
  const start = startedAt?.getTime()
  useEffect(() => {
    if (!running || start === undefined || !Number.isFinite(start)) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [running, start])
  return running && start !== undefined && Number.isFinite(start) ? <span className="thought-elapsed">{formatElapsed(now - start)}</span> : null
}
export function ThoughtRow({ row }: { row: Extract<Row, { kind: 'thought' }> }) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (!row.running) setOpen(false) }, [row.running])
  return <div className={`thought ${row.running ? 'is-run' : 'is-done'}`}><button className="thought-head" aria-expanded={open} onClick={() => setOpen(value => !value)}><span className={`thought-label${row.running ? ' is-shimmer' : ''}`}>{row.running ? '思考中' : 'Thought process'}</span><Elapsed running={row.running} startedAt={row.startedAt} /><span className="thought-toggle" aria-hidden>{open ? '⌃' : '›'}</span></button><CurtainFold open={open}><div className="thought-body"><pre className="thought-text">{row.text}</pre></div></CurtainFold></div>
}
export function orbState(name: string): OrbState {
  if (/search|grep|glob|citations/.test(name)) return 'searching'
  if (/write|edit/.test(name)) return 'composing'
  if (/fetch|read_url|extract_pdf/.test(name)) return 'weaving'
  if (/run_code|execute/.test(name)) return 'solving'
  if (/ask_user|image/.test(name)) return 'listening'
  return name === 'read_memory' ? 'connecting' : 'working'
}
export function ProcessRow({ row }: { row: Extract<Row, { kind: 'process' }> }) {
  const [open, setOpen] = useState(row.running), [all, setAll] = useState(false)
  const visible = all ? row.steps : row.steps.slice(-6), hidden = row.steps.length - visible.length
  const head = row.running ? [...row.steps].reverse().find(step => step.status === 'running')?.label ?? '研究中…' : `${row.steps.length} 个工具`
  return <div className={`proc ${row.running ? 'proc-running' : 'proc-done'}`}><button className="proc-head" aria-expanded={open} onClick={() => setOpen(value => !value)}><ThinkingOrb className="proc-orb" state={orbState(([...row.steps].reverse().find(step => step.status === 'running') ?? row.steps[row.steps.length - 1])?.name ?? '')} size={20} theme="dark" paused={!row.running} speed={row.running ? 1.15 : 1} style={{ width: 20, height: 20 }} aria-hidden /><span className={`proc-label${row.running ? ' is-shimmer' : ''}`}>{head}</span><Elapsed running={row.running} startedAt={row.startedAt} /><span className="proc-toggle">{open ? '收起' : `${row.steps.length} ›`}</span></button><CurtainFold open={open} stagger><ul className="proc-steps">{hidden > 0 && <li className="proc-step proc-step-more"><button className="proc-more" onClick={() => setAll(true)}>查看更早 {hidden} 步</button></li>}{visible.map(step => <li key={step.id} className={`proc-step${step.status !== 'running' ? ' is-done' : ''}`}><span className={`proc-step-dot${step.status === 'completed' ? ' is-done' : ''}`} /><span className="proc-step-label" title={step.name}>{step.label}</span>{step.chip && <span className="proc-step-chip" title={step.chip}>{step.chip}</span>}{step.status === 'failed' && <span className="mw-process-error" title={step.error}>失败</span>}{step.status === 'stopped' && <span className="proc-step-chip">未完成</span>}</li>)}{all && row.steps.length > 6 && <li className="proc-step"><button className="proc-more" onClick={() => setAll(false)}>仅显示最近步骤</button></li>}</ul></CurtainFold></div>
}
export function Waiting({ startedAt }: { startedAt: Date | null }) { return <div className="bubble bubble-status think-status" role="status" aria-live="polite"><span className="think-aperture" aria-hidden><InlineLoader variant="aperture" size={32} color="var(--ink-soft)" speed={1.05} /></span><span className="think-label is-shimmer">思考中</span><Elapsed running startedAt={startedAt} /></div> }
