/**
 * [INPUT]: Markdown.tsx 源码
 * [OUTPUT]: 禁止全局 React 树缓存(闭包会串 taskId)；中文标点贴着 ** 时照样加粗(remark-cjk-friendly 接在终稿与流式两条管线)
 * [POS]: 验收退回 P1;历史不重 parse 靠 memo + item 引用,不靠元素 LRU
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkCjkFriendlyStrikethrough from 'remark-cjk-friendly-gfm-strikethrough'

describe('Markdown 不得缓存带行为闭包的 React 树', () => {
  it('Markdown.tsx 不引用 markdownCache / 全局 setCached', async () => {
    const src = await readFile(new URL('../src/components/Markdown.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(src, /markdownCache/)
    assert.doesNotMatch(src, /getCachedMarkdown|setCachedMarkdown|markdownCacheKey/)
  })

  it('markdownCache.ts 已删除', async () => {
    const path = new URL('../src/components/markdownCache.ts', import.meta.url)
    await assert.rejects(
      () => access(path, constants.F_OK),
      (err: NodeJS.ErrnoException) => err.code === 'ENOENT',
    )
  })
})

describe('bold works when ** touches full-width punctuation', () => {
  const strong = (source: string, plugins: unknown[]) => {
    const tree = unified().use(remarkParse).use(plugins as never).runSync(unified().use(remarkParse).use(plugins as never).parse(source))
    const found: string[] = []
    const walk = (node: { type: string; children?: unknown[]; value?: string }) => {
      if (node.type === 'strong') found.push((node.children as { value?: string }[]).map(child => child.value ?? '').join(''))
      for (const child of node.children ?? []) walk(child as never)
    }
    walk(tree as never)
    return found
  }
  const line = '**深度反馈控制（DFC）**源于运动控制，**预测编码（PC）**源于感觉皮层'
  it('plain CommonMark gets it wrong (the bug is real)', () => {
    assert.notDeepEqual(strong(line, [remarkGfm]), ['深度反馈控制（DFC）', '预测编码（PC）'])
  })
  it('with cjk-friendly both spans are bold', () => {
    assert.deepEqual(strong(line, [remarkGfm, remarkCjkFriendly, remarkCjkFriendlyStrikethrough]), ['深度反馈控制（DFC）', '预测编码（PC）'])
  })
  it('Markdown.tsx wires it into both the final and the streaming pipeline', async () => {
    const src = await readFile(new URL('../src/components/Markdown.tsx', import.meta.url), 'utf8')
    assert.match(src, /const REMARK_FULL = \[remarkGfm, \.\.\.CJK, remarkMath\]/)
    assert.match(src, /const REMARK_STREAM = \[remarkGfm, \.\.\.CJK\]/)
  })
})
