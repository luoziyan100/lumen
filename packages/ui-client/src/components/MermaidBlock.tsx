/**
 * [INPUT]: mermaid(动态 import);tokens.css;mermaidSanitize(v0–v2 颜色闸);ExpandIcon/CopyIcon
 * [OUTPUT]: MermaidBlock —— ```mermaid → SVG;悬停工具条:放大 / 复制源码(原文,非改写稿)
 * [POS]: Markdown 的语言围栏分支;与 show-widget 沙箱并列,专吃结构图 DSL
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 *
 * 渲染前 sanitizeMermaidSource:语义 class 映射 + 字面色对比度门禁;theme dark+darkMode。
 * 复制按钮始终给用户/模型原文,改写只服务可读像素。
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { glassMermaidThemeVariables, sanitizeMermaidSource } from '../mermaidSanitize'
import { CheckIcon, CloseIcon, CopyIcon, ExpandIcon, ICON_SM } from './icons'

function readThemeVars(el: HTMLElement): Record<string, string> {
  const cs = getComputedStyle(el)
  const base = glassMermaidThemeVariables()
  const v = (name: string, fallback: string): string =>
    (cs.getPropertyValue(name).trim() || fallback)
  // CSS 变量可能是 rgba;mermaid 对实色更稳。有 token 时覆盖关键项,解析失败则保留 glass 实色。
  return {
    ...base,
    primaryColor: v('--ember-tint', base.primaryColor!),
    primaryTextColor: v('--ink', base.primaryTextColor!),
    primaryBorderColor: v('--ember', base.primaryBorderColor!),
    secondaryColor: v('--paper-deep', base.secondaryColor!),
    secondaryTextColor: v('--ink-mute', base.secondaryTextColor!),
    secondaryBorderColor: v('--sand-deep', base.secondaryBorderColor!),
    tertiaryColor: v('--vellum', base.tertiaryColor!),
    tertiaryTextColor: v('--ink', base.tertiaryTextColor!),
    tertiaryBorderColor: v('--sand', base.tertiaryBorderColor!),
    lineColor: v('--ink-mute', base.lineColor!),
    textColor: v('--ink', base.textColor!),
    mainBkg: v('--paper-solid', base.mainBkg!),
    nodeBorder: v('--sand-deep', base.nodeBorder!),
    clusterBkg: v('--paper-deep', base.clusterBkg!),
    clusterBorder: v('--sand-deep', base.clusterBorder!),
    titleColor: v('--ink', base.titleColor!),
    edgeLabelBackground: v('--paper-deep', base.edgeLabelBackground!),
    fontFamily: v('--font-sans', base.fontFamily!),
  }
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

export function MermaidBlock({ chart }: { chart: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const reactId = useId().replace(/:/g, '')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const source = chart.trim()
    if (!source) {
      setSvg(null)
      setError(null)
      return
    }
    let cancelled = false
    setError(null)
    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        const host = hostRef.current
        const themeVariables = host ? readThemeVars(host) : glassMermaidThemeVariables()
        const { source: safeSource } = sanitizeMermaidSource(source)
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'dark',
          darkMode: true,
          themeVariables,
          fontFamily: themeVariables.fontFamily,
        })
        const id = `mmd-${reactId}-${Math.random().toString(36).slice(2, 8)}`
        const { svg: out } = await mermaid.render(id, safeSource)
        if (!cancelled) setSvg(out)
      } catch (e) {
        if (!cancelled) {
          setSvg(null)
          setError(e instanceof Error ? e.message : '流程图渲染失败')
        }
      }
    })()
    return () => { cancelled = true }
  }, [chart, reactId])

  useEffect(() => {
    if (!expanded) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [expanded])

  async function onCopy(): Promise<void> {
    await copyText(chart.trim())
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  const toolbar = svg && !error && (
    <div className="mermaid-toolbar" role="toolbar" aria-label="流程图操作">
      <button type="button" className="mermaid-tool" title="放大查看" aria-label="放大查看" onClick={() => setExpanded(true)}>
        <ExpandIcon size={ICON_SM} />
      </button>
      <button
        type="button"
        className={`mermaid-tool${copied ? ' is-copied' : ''}`}
        title={copied ? '已复制' : '复制 Mermaid 源码'}
        aria-label={copied ? '已复制' : '复制 Mermaid 源码'}
        onClick={() => { void onCopy() }}
      >
        {copied ? <CheckIcon size={ICON_SM} /> : <CopyIcon size={ICON_SM} />}
      </button>
    </div>
  )

  return (
    <div ref={hostRef} className="mermaid-block" role="img" aria-label="流程图">
      {toolbar}
      <div className="mermaid-scroll">
        {error ? (
          <div className="mermaid-fallback">
            <div className="mermaid-error">{error}</div>
            <pre className="mermaid-source"><code>{chart}</code></pre>
          </div>
        ) : svg ? (
          <div className="mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="mermaid-pending" aria-busy="true">正在绘制…</div>
        )}
      </div>

      {expanded && svg && createPortal(
        <div
          className="mermaid-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="流程图放大"
          onClick={() => setExpanded(false)}
        >
          <div className="mermaid-lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <span className="mermaid-lightbox-title">流程图</span>
            <button type="button" className="mermaid-tool" title="复制源码" aria-label="复制源码" onClick={() => { void onCopy() }}>
              {copied ? <CheckIcon size={ICON_SM} /> : <CopyIcon size={ICON_SM} />}
            </button>
            <button type="button" className="mermaid-tool" title="关闭" aria-label="关闭" onClick={() => setExpanded(false)}>
              <CloseIcon size={ICON_SM} />
            </button>
          </div>
          <div
            className="mermaid-lightbox-body"
            onClick={(e) => e.stopPropagation()}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}
