/**
 * [INPUT]: mermaid(动态 import);tokens.css 青瓷色板;ExpandIcon/CopyIcon
 * [OUTPUT]: MermaidBlock —— ```mermaid → SVG;悬停工具条:放大 / 复制源码
 * [POS]: Markdown 的语言围栏分支;与 show-widget 沙箱并列,专吃结构图 DSL
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, CloseIcon, CopyIcon, ExpandIcon, ICON_SM } from './icons'

function readThemeVars(el: HTMLElement): Record<string, string> {
  const cs = getComputedStyle(el)
  const v = (name: string, fallback: string): string =>
    (cs.getPropertyValue(name).trim() || fallback)
  return {
    background: 'transparent',
    primaryColor: v('--ember-tint', '#e8f0eb'),
    primaryTextColor: v('--ink', '#211F1C'),
    primaryBorderColor: v('--ember', '#2F6B4E'),
    secondaryColor: v('--paper-deep', '#f4f2ec'),
    secondaryTextColor: v('--ink', '#211F1C'),
    secondaryBorderColor: v('--sand-deep', '#cfc8ba'),
    tertiaryColor: v('--vellum', '#eeeae2'),
    tertiaryTextColor: v('--ink', '#211F1C'),
    tertiaryBorderColor: v('--sand', '#ddd6c8'),
    lineColor: v('--ink-mute', '#8a8378'),
    textColor: v('--ink', '#211F1C'),
    mainBkg: v('--paper-solid', '#fffefb'),
    nodeBorder: v('--sand-deep', '#cfc8ba'),
    clusterBkg: v('--paper-deep', '#f4f2ec'),
    clusterBorder: v('--sand-deep', '#cfc8ba'),
    titleColor: v('--ink', '#211F1C'),
    edgeLabelBackground: v('--paper-solid', '#fffefb'),
    fontFamily: v('--font-sans', 'sans-serif'),
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
        const themeVariables = host ? readThemeVars(host) : undefined
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables,
          fontFamily: themeVariables?.fontFamily,
        })
        const id = `mmd-${reactId}-${Math.random().toString(36).slice(2, 8)}`
        const { svg: out } = await mermaid.render(id, source)
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
