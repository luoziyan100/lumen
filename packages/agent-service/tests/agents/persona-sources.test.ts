/**
 * [INPUT]: LUMEN_PERSONA 检索之后段 + web/papers/pdf 工具 description
 * [OUTPUT]: Sources 能力合同钉:作品身份;GitHub 一 repo 一条;arXiv n 篇 n 条;blob/raw 合并;
 *           工具 description 学 Claude 方法(何时用/兄弟/回指作品/参数 description),不另立法
 * [POS]: 与 persona-mermaid 同构的能力合同钉;不测人格 L0–L3
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { LUMEN_PERSONA } from '../../src/agents/persona.ts'
import { createPaperTools } from '../../src/tools/research/papers.ts'
import { createPdfTools } from '../../src/tools/research/pdf.ts'
import { createFetchUrlTool } from '../../src/tools/research/fetch-url.ts'
import { createSearchWebTool } from '../../src/tools/research/search-web.ts'

type JsonProps = Record<string, { description?: string }>

function paramDesc(parameters: Record<string, unknown>, name: string): string {
  const props = (parameters as { properties?: JsonProps }).properties ?? {}
  return props[name]?.description ?? ''
}

function allParamDescs(parameters: Record<string, unknown>): JsonProps {
  return (parameters as { properties?: JsonProps }).properties ?? {}
}

function sourcesSection(): string {
  const vizAt = LUMEN_PERSONA.indexOf('# 对话内可视化')
  const srcAt = LUMEN_PERSONA.indexOf('# 检索之后 → Sources')
  assert.ok(srcAt > vizAt, 'Sources 段在可视化之后、提示词末尾')
  return LUMEN_PERSONA.slice(srcAt)
}

describe('persona Sources 能力合同', () => {
  it('目的是答复站在哪些作品上,不是工具碰过的 URL', () => {
    const section = sourcesSection()
    assert.match(section, /## 这是什么/)
    assert.match(section, /这篇答复站在哪些作品上/)
    assert.match(section, /不是「你用工具碰过哪些 URL」/)
    assert.match(section, /## 写在哪/)
    assert.match(section, /最后一块写 Sources/)
    assert.match(section, /不要插在中间/)
    assert.doesNotMatch(section, /核心页|is core|是否重要|重要性/)
    assert.doesNotMatch(section, /宿主会按站点|宿主表/)
  })

  it('GitHub 一个 repo 一条,不列文件清单', () => {
    const section = sourcesSection()
    assert.match(section, /一个 repo 是一件作品/)
    assert.match(section, /只给仓库根/)
    assert.match(section, /README/)
    assert.match(section, /blob/)
    assert.match(section, /raw/)
    assert.match(section, /01 welcome\.md/)
    assert.match(section, /47 faq\.md/)
    assert.match(section, /路径名当标题/)
  })

  it('arXiv 用了几篇就几条,abs/pdf 不双列', () => {
    const section = sourcesSection()
    assert.match(section, /arXiv 五篇就是五条/)
    assert.match(section, /abs 或 pdf 留一条/)
    assert.match(section, /一篇论文是一件作品,不是一个 host/)
  })

  it('同一作品的 blob/raw、abs/pdf 合成一条', () => {
    const section = sourcesSection()
    assert.match(section, /blob 与 raw/)
    assert.match(section, /abs 与 pdf/)
    assert.match(section, /合成一条/)
  })

  it('格式是朴素 Sources: + [标题](url)', () => {
    const section = sourcesSection()
    assert.match(section, /## 格式/)
    assert.match(section, /Sources:/)
    assert.match(section, /\[标题\]\(url\)/)
    assert.match(section, /不加粗/)
    assert.match(section, /不大标题/)
  })
})

describe('研究工具 description Sources 合同', () => {
  it('search_web 覆盖何时用 + 兄弟 search_papers + Sources 回指作品,不列所有搜索 URL', () => {
    const search = createSearchWebTool()
    const desc = search?.spec.description ?? ''
    assert.match(desc, /何时用/)
    assert.match(desc, /search_papers/)
    assert.match(desc, /系统提示/)
    assert.match(desc, /#检索之后/)
    assert.match(desc, /Sources/)
    assert.match(desc, /作品/)
    assert.match(desc, /fetch_url/)
    assert.ok(paramDesc(search?.spec.parameters ?? {}, 'query').length > 0, 'query 必须有 description')
    assert.doesNotMatch(desc, /列出所有搜索 URL/)
    assert.doesNotMatch(desc, /list all relevant URLs/i)
    assert.doesNotMatch(desc, /核心页|按重要性排序/)
  })

  it('fetch_url 回指 persona 作品合同,并写清 vs extract_pdf', () => {
    const fetch = createFetchUrlTool({ http: async () => ({ status: 200, ok: true, text: async () => '', json: async () => ({}), bytes: async () => new Uint8Array() }) })
    const desc = fetch?.spec.description ?? ''
    assert.match(desc, /何时用/)
    assert.match(desc, /extract_pdf/)
    assert.match(desc, /检索之后/)
    assert.match(desc, /作品/)
    assert.doesNotMatch(desc, /列出所有搜索 URL/)
    assert.doesNotMatch(desc, /站点或原先的检索命中/)
    for (const [key, schema] of Object.entries(allParamDescs(fetch?.spec.parameters ?? {}))) {
      assert.ok(schema.description, `fetch_url.${key} 缺 description`)
    }
  })

  it('search_papers / get_citations 回指 persona:一篇一条', () => {
    const tools = createPaperTools({ http: async () => ({ status: 200, ok: true, text: async () => '', json: async () => ({}), bytes: async () => new Uint8Array() }) })
    const search = tools.find((t) => t.spec.name === 'search_papers')
    const cites = tools.find((t) => t.spec.name === 'get_citations')
    assert.match(search?.spec.description ?? '', /何时用/)
    assert.match(search?.spec.description ?? '', /search_web/)
    assert.match(search?.spec.description ?? '', /系统提示/)
    assert.match(search?.spec.description ?? '', /几篇论文就几条/)
    assert.match(search?.spec.description ?? '', /abs\+pdf/)
    assert.match(cites?.spec.description ?? '', /系统提示/)
    assert.match(cites?.spec.description ?? '', /一篇一条/)
    assert.ok(paramDesc(search?.spec.parameters ?? {}, 'query').length > 0, 'search_papers.query 必须有 description')
    for (const [key, schema] of Object.entries(allParamDescs(cites?.spec.parameters ?? {}))) {
      assert.ok(schema.description, `get_citations.${key} 缺 description`)
    }
  })

  it('extract_pdf 写清何时用 vs fetch_url,不另立 Sources 法', () => {
    const [extract] = createPdfTools()
    const desc = extract.spec.description
    assert.match(desc, /何时用/)
    assert.match(desc, /fetch_url/)
    assert.match(desc, /检索之后/)
    assert.doesNotMatch(desc, /列出所有搜索 URL/)
    for (const [key, schema] of Object.entries(allParamDescs(extract.spec.parameters))) {
      assert.ok(schema.description, `extract_pdf.${key} 缺 description`)
    }
  })
})
