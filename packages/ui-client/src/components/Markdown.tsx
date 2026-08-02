/**
 * [INPUT]: react-markdown + remark-gfm/math + rehype-katex/highlight;MermaidBlock
 * [OUTPUT]: Markdown —— GFM/数学/代码高亮 + ```mermaid 流程图
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

const REMARK = [remarkGfm, remarkMath]
const REHYPE = [rehypeKatex, rehypeHighlight]

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

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={REMARK}
        rehypePlugins={REHYPE}
        components={{
          pre({ children, ...props }) {
            const kids = Children.toArray(children)
            const code = kids[0]
            if (isMermaidCode(code)) {
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
