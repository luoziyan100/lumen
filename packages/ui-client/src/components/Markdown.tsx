/**
 * [INPUT]: react-markdown + remark-gfm/math + rehype-katex/highlight;MermaidBlock
 * [OUTPUT]: Markdown —— GFM/数学/代码高亮 + ```mermaid 流程图;deferMath 流式暂缓 KaTeX
 * [POS]: .md 阅读器与 AssistantContent 的文本段;show-widget 不经此组件
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { Children, isValidElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import './hljs-celadon.css'
import { MermaidBlock } from './MermaidBlock'

const REMARK_FULL = [remarkGfm, remarkMath]
const REHYPE_FULL = [rehypeKatex, rehypeHighlight]
/** 流式期关掉 math:半截公式会使 KaTeX 成败交替 → 高度非单调 → 贴底振荡 */
const REMARK_STREAM = [remarkGfm]
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

export function Markdown({
  children,
  deferMath = false,
}: {
  children: string
  /** true:流式中暂缓 KaTeX/remark-math,定稿后再渲染 */
  deferMath?: boolean
}) {
  const remarkPlugins = deferMath ? REMARK_STREAM : REMARK_FULL
  const rehypePlugins = deferMath ? REHYPE_STREAM : REHYPE_FULL
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          pre({ children, ...props }) {
            const kids = Children.toArray(children)
            const code = kids[0]
            if (isMermaidCode(code)) {
              // 流式未闭合的 mermaid 不渲染,避免高度狂抖
              if (deferMath) {
                return (
                  <pre {...props}>
                    <code className="language-mermaid">{codeText(code.props.children)}</code>
                  </pre>
                )
              }
              return <MermaidBlock chart={codeText(code.props.children)} />
            }
            return <pre {...props}>{children}</pre>
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
