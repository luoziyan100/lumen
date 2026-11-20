/**
 * [INPUT]: react-markdown + remark-gfm/math + remark-cjk-friendly(含 GFM 删除线版) + rehype-katex/highlight;MermaidBlock;markdownMath
 * [OUTPUT]: Markdown —— GFM/数学/代码高亮 + ```mermaid 流程图;deferMath 流式暂缓 KaTeX
 * [POS]: .md 阅读器与 AssistantContent 的文本段;show-widget 不经此组件;
 *        终稿在 ReactMarkdown 前走 normalizeMathDelimiters(\( \)/\[ \]→$/$$);流式不归一、不跑 KaTeX。
 *        禁全局 React 树缓存(会把 mermaidFix 闭包串会话);历史不重 parse 靠 item 引用 + memo。
 *        mermaidFix 只由对话终稿注入,阅读器不修图。
 *        流式 mermaid 保持源码 pre;定稿后 MermaidBlock 箱外测量,主流一次提交 final SVG。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { Children, isValidElement, memo, useMemo, type ComponentProps, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkCjkFriendlyStrikethrough from 'remark-cjk-friendly-gfm-strikethrough'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import './hljs-celadon.css'
import type { MermaidFix } from '../mermaid/mermaidFixLedger'
import { MermaidBlock } from './MermaidBlock'
import { useOpenExternal } from './ExternalLinkDialog'
import { normalizeMathDelimiters } from './markdownMath.ts'

const CJK = [remarkCjkFriendly, remarkCjkFriendlyStrikethrough]
const REMARK_FULL = [remarkGfm, ...CJK, remarkMath]
const REHYPE_FULL = [rehypeKatex, rehypeHighlight]
/** No math while streaming: a half-written formula makes KaTeX alternate between success and failure, the height jumps and the stick-to-bottom scroll oscillates */
const REMARK_STREAM = [remarkGfm, ...CJK]
const REHYPE_STREAM = [rehypeHighlight]

type CodeProps = { className?: string; children?: ReactNode }

function isMermaidCode(node: ReactNode): node is React.ReactElement<CodeProps> {
  if (!isValidElement(node)) return false
  const props = node.props as CodeProps
  const cls = typeof props.className === 'string' ? props.className : ''
  return cls.includes('language-mermaid')
}

function codeText(children: ReactNode): string {
  return String(children ?? '').replace(/\n$/, '')
}

export const Markdown = memo(function Markdown({
  children,
  deferMath = false,
  mermaidFix,
}: {
  children: string
  /** true: hold KaTeX/remark-math while streaming, render it once the text is final */
  deferMath?: boolean
  /** A diagram that fails goes back to the current conversation to be fixed */
  mermaidFix?: MermaidFix
}) {
  const remarkPlugins = deferMath ? REMARK_STREAM : REMARK_FULL
  const rehypePlugins = deferMath ? REHYPE_STREAM : REHYPE_FULL
  const markdown = deferMath ? children : normalizeMathDelimiters(children)
  const openExternal = useOpenExternal()
  const components = useMemo(() => ({
    a({ href, children, ...props }: ComponentProps<'a'>) {
      if (href && /^https?:\/\//i.test(href)) {
        return (
          <a
            {...props}
            href={href}
            onClick={(e) => {
              e.preventDefault()
              openExternal(href)
            }}
          >
            {children}
          </a>
        )
      }
      return <a {...props} href={href}>{children}</a>
    },
    pre({ children, ...props }: ComponentProps<'pre'>) {
      const kids = Children.toArray(children)
      const code = kids[0]
      if (isMermaidCode(code)) {
        // An unclosed mermaid block mid-stream stays source, or the height would thrash
        if (deferMath) {
          return (
            <pre {...props}>
              <code className="language-mermaid">{codeText(code.props.children)}</code>
            </pre>
          )
        }
        return <MermaidBlock chart={codeText(code.props.children)} fix={mermaidFix} />
      }
      return <pre {...props}>{children}</pre>
    },
  }), [openExternal, deferMath, mermaidFix])
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
})
