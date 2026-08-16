/**
 * [INPUT]: mermaidSyntax Phase A 规则
 * [OUTPUT]: kind 门控 / 引号修复 / R7 补 ] / sequence·class 不误伤 / 错误摘要
 * [POS]: doc/mermaid-pipeline.md AT-A1/A6/A7 + R7 Omarchy 漏括号
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectDiagramKind,
  repairMermaidSyntax,
  summarizeParseError,
  prepareMermaid,
  prepareAndValidate,
  mermaidMetrics,
} from '../src/mermaidSyntax.ts'

beforeEach(() => {
  mermaidMetrics.reset()
})

describe('detectDiagramKind', () => {
  it('flowchart / graph', () => {
    assert.equal(detectDiagramKind('flowchart TB\n  A-->B'), 'flowchart')
    assert.equal(detectDiagramKind('graph LR\n  A-->B'), 'flowchart')
  })
  it('sequence / class', () => {
    assert.equal(detectDiagramKind('sequenceDiagram\n  A->>B: hi'), 'sequence')
    assert.equal(detectDiagramKind('classDiagram\n  class Foo'), 'class')
  })
})

describe('repairMermaidSyntax flowchart', () => {
  it('AT-A1: 裸 {sessionId} 标签加引号', () => {
    const src = `flowchart TB
  S[SandboxSync / LimaSync<br/>rsync 到 VM 内 ~/.claude/sandbox/{sessionId}]
`
    const { source, kind, actions } = repairMermaidSyntax(src)
    assert.equal(kind, 'flowchart')
    assert.ok(actions.includes('quote-label'))
    assert.match(source, /S\["SandboxSync[\s\S]*\{sessionId\}"\]/)
    assert.ok(!source.includes('S[SandboxSync'))
  })

  it('R4: 已引号标签含 {} 不二次包裹', () => {
    const src = 'flowchart TB\n  A["path/{id}"]\n'
    const { source, actions } = repairMermaidSyntax(src)
    assert.equal(actions.filter((a) => a === 'quote-label').length, 0)
    assert.match(source, /A\["path\/\{id\}"\]/)
  })

  it('R4: 转义引号标签不截断', () => {
    const src = 'flowchart TB\n  A["say \\"hi\\""]\n'
    const { source } = repairMermaidSyntax(src)
    assert.match(source, /A\["say \\"hi\\""\]/)
  })

  it('无危险符不强制引号', () => {
    const src = 'flowchart TB\n  A[入口] --> B[核心]\n'
    const { source, actions } = repairMermaidSyntax(src)
    assert.equal(actions.filter((a) => a === 'quote-label').length, 0)
    assert.match(source, /A\[入口\]/)
  })

  it('R5: flowchart -> 改为 -->', () => {
    const src = 'flowchart TB\n  A -> B\n'
    const { source, actions } = repairMermaidSyntax(src)
    assert.ok(actions.includes('arrow-fix'))
    assert.match(source, /A\s*-->\s*B/)
  })

  it('R7: 引号标签漏 ] 且下一 token 是边', () => {
    const src = `flowchart TB
  E["DHH 的默认与审美(omakase 式)" -. "贯穿每一层" .-> A
  E -.-> B
`
    const { source, actions } = repairMermaidSyntax(src)
    assert.ok(actions.includes('close-rect'))
    assert.match(source, /E\["DHH 的默认与审美\(omakase 式\)"\]\s*-\./)
    assert.ok(!/E\["DHH[^"]*"\s*-\./.test(source))
  })

  it('R7: Omarchy 整图漏 ] 后可闭合', () => {
    const src = `flowchart TB
  A["应用层:Neovim、Chromium、Obsidian、LibreOffice、OBS、Winamp 式播放器…"] --> B["桌面壳:Quickshell(顶栏、通知、托盘、统一剪贴板)"]
  B --> C["窗口管理:Hyprland(平铺式)"]
  C --> D["系统层:Arch Linux"]
  E["DHH 的默认与审美(omakase 式)" -. "贯穿每一层" .-> A
  E -.-> B
  E -.-> C
  E -.-> D
`
    const { source, actions } = repairMermaidSyntax(src)
    assert.ok(actions.includes('close-rect'))
    assert.match(source, /E\["DHH 的默认与审美\(omakase 式\)"\]\s*-\.\s*"贯穿每一层"\s*\.->\s*A/)
  })

  it('R7: 已闭合的 ] 不重复补', () => {
    const src = 'flowchart TB\n  A["入口"] --> B["出口"]\n'
    const { source, actions } = repairMermaidSyntax(src)
    assert.equal(actions.filter((a) => a === 'close-rect').length, 0)
    assert.match(source, /A\["入口"\] --> B\["出口"\]/)
  })

  it('R1: 弯引号', () => {
    const src = 'flowchart TB\n  A[“入口”]\n'
    const { source, actions } = repairMermaidSyntax(src)
    assert.ok(actions.includes('smart-quotes'))
    assert.ok(source.includes('"'))
    assert.ok(!source.includes('“'))
  })
})

describe('repairMermaidSyntax kind 门控', () => {
  it('AT-A6: sequence A->B: 不被 R5 改成 -->', () => {
    const src = `sequenceDiagram
  participant A
  A->B: 调用
`
    const { source, kind } = repairMermaidSyntax(src)
    assert.equal(kind, 'sequence')
    assert.match(source, /A->B:/)
    assert.ok(!/A\s*-->\s*B:/.test(source))
  })

  it('AT-A7: classDiagram class Foo { 不被 R2 改坏', () => {
    const src = `classDiagram
  class Foo {
    +bar()
  }
`
    const { source, kind, actions } = repairMermaidSyntax(src)
    assert.equal(kind, 'class')
    assert.equal(actions.filter((a) => a === 'quote-label').length, 0)
    assert.match(source, /class Foo \{/)
  })
})

describe('summarizeParseError', () => {
  it('DIAMOND_START → 人话 + 行号', () => {
    const msg = summarizeParseError(
      new Error("Parse error on line 23: ... got 'DIAMOND_START'"),
    )
    assert.match(msg, /第 23 行/)
    assert.match(msg, /未加引号|\{/)
  })
})

describe('prepareAndValidate', () => {
  it('parse 成功计 metrics', async () => {
    const r = await prepareAndValidate('flowchart TB\n  A-->B\n', async () => {})
    assert.equal(r.ok, true)
    assert.equal(mermaidMetrics.parse_ok, 1)
  })

  it('parse 失败给短 error + detail', async () => {
    const r = await prepareAndValidate('flowchart TB\n  A[{\n', async () => {
      throw new Error("Parse error on line 2: got 'DIAMOND_START'")
    })
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.match(r.error, /第 2 行|未加引号/)
      assert.ok(r.detail.includes('DIAMOND'))
    }
    assert.equal(mermaidMetrics.parse_fail, 1)
  })
})

describe('prepareMermaid 组合颜色闸', () => {
  it('语法与颜色串联不抛', () => {
    const { source, kind } = prepareMermaid('flowchart TB\n  A[入口] --> B[出口]\n')
    assert.equal(kind, 'flowchart')
    assert.ok(source.includes('flowchart'))
  })
})
