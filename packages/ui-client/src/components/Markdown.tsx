/** Markdown 渲染:GFM(表格/任务列表/删除线)+ KaTeX 数学 + 代码高亮。
 *  用于 assistant 回复气泡与 .md 文档阅读。 */
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
