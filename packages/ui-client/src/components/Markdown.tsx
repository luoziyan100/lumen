/**
 * [INPUT]: react-markdown + remark-gfm/math + rehype-katex/highlight
 * [OUTPUT]: Markdown —— GFM/数学/代码高亮渲染
 * [POS]: .md 阅读器与 AssistantContent 的文本段;show-widget 不经此组件
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'katex/dist/katex.min.css'
import './hljs-celadon.css'

const REMARK = [remarkGfm, remarkMath]
const REHYPE = [rehypeKatex, rehypeHighlight]

export function Markdown({ children }: { children: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE}>{children}</ReactMarkdown>
    </div>
  )
}
