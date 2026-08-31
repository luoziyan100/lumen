/**
 * [INPUT]: mermaidMeasureHost 纯函数(宽度分桶 / final 缓存闸)
 * [OUTPUT]: cache 只接受 tightened SVG;宽度分桶避免窄栏高度复用到宽栏
 * [POS]: Phase 3 一次提交合同
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  cacheHoldsFinalSvg,
  mermaidLayoutCacheKey,
  widthBucket,
} from '../src/mermaid/mermaidMeasureHost.ts'

describe('mermaid layout cache key', () => {
  it('width buckets by 16px', () => {
    assert.equal(widthBucket(640), 640)
    assert.equal(widthBucket(641), 640)
    assert.equal(widthBucket(648), 656)
    assert.equal(widthBucket(0), 0)
  })

  it('different width buckets produce different keys', () => {
    const a = mermaidLayoutCacheKey('abc', 400)
    const b = mermaidLayoutCacheKey('abc', 800)
    assert.notEqual(a, b)
    assert.equal(mermaidLayoutCacheKey('abc', 400), mermaidLayoutCacheKey('abc', 401))
  })
})

describe('cacheHoldsFinalSvg', () => {
  it('rejects raw unmarked svg', () => {
    assert.equal(cacheHoldsFinalSvg({ svg: '<svg></svg>' }), false)
    assert.equal(cacheHoldsFinalSvg({ svg: '<svg></svg>', tightened: false }), false)
    assert.equal(cacheHoldsFinalSvg({ svg: null, tightened: true }), false)
  })

  it('accepts tightened final svg', () => {
    assert.equal(cacheHoldsFinalSvg({ svg: '<svg data-ink-tight="1"></svg>', tightened: true }), true)
  })
})

describe('cached SVG host policy stays off the markup', () => {
  it('layout normalizer is the only size hook from measure host', async () => {
    const { readFile } = await import('node:fs/promises')
    const host = await readFile(new URL('../src/mermaid/mermaidMeasureHost.ts', import.meta.url), 'utf8')
    assert.match(host, /normalizeSvgIntrinsicSize\(svg\)/)
    assert.doesNotMatch(host, /maxWidth\s*=\s*['"]100%['"]/)
    assert.doesNotMatch(host, /style\.maxWidth/)
  })
})
