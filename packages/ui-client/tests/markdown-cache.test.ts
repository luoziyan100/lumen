/**
 * [INPUT]: Markdown.tsx 源码
 * [OUTPUT]: 禁止全局 React 树缓存(闭包会串 taskId)
 * [POS]: 验收退回 P1;历史不重 parse 靠 memo + item 引用,不靠元素 LRU
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'

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
