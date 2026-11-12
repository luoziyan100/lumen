/**
 * [INPUT]: 真实 icons.tsx 导出组件、FileTypeIcon/skillGlyphForName 与 yan-design-system 全部几何(React SSR)
 * [OUTPUT]: 每个图标都是 24 网格、currentColor 描边、无填充(仅 solid 记号例外)、几何不出画布；镜像只加 scaleX
 * [POS]: doc/ui-design.md §3.1 的结构验收；像素与动效观感由明暗基线实渲核对，不在此冒充
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement, type ComponentType } from 'react'

register('./helpers/tsx-loader.mjs', import.meta.url)
const { renderToStaticMarkup } = await import('react-dom/server')
const icons = await import('../src/components/icons.tsx') as Record<string, unknown>
const { GLYPHS } = await import('yan-design-system/icons')

const exported = Object.entries(icons).filter(([name, value]) => /(Icon|Glyph)$/.test(name) && typeof value === 'object' && value !== null)
const fileTypes = ['a.pdf', 'a.html', 'a.png', 'a.zip', 'a.csv', 'a.pptx', 'a.mp3', 'a.mp4', 'a.unknown']
const skills = ['paper', 'calendar', 'design', 'memory', 'context', 'setup', 'help', 'search', 'code', 'other']

function render(Component: unknown, props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(createElement(Component as ComponentType<Record<string, unknown>>, props))
}

function assertLineIcon(name: string, markup: string): void {
  assert.match(markup, /^<svg[^>]*viewBox="0 0 24 24"/, `${name} 不在 24 网格`)
  assert.match(markup, /^<svg[^>]*fill="none"[^>]*stroke="currentColor"/, `${name} 外层未固定无填充与 currentColor`)
  assert.match(markup, /class="lumen-icon li li-/, `${name} 缺少动效作用域`)
  // 内部只允许 solid 实心记号；其余元素不得自带填充或颜色
  const inner = markup.replace(/^<svg[^>]*>/, '')
  assert.doesNotMatch(inner, /\s(fill|stroke|color)="/, `${name} 内部自带颜色或填充`)
  assert.doesNotMatch(inner, /#[0-9a-f]{3,8}\b|rgb\(/i, `${name} 含字面色值`)
  for (const value of inner.matchAll(/\s(?:x|y|cx|cy|width|height)="([-\d.]+)"/g)) {
    const n = Number(value[1])
    assert.ok(n >= 0 && n <= 24, `${name} 几何越出画布: ${value[0]}`)
  }
  for (const d of inner.matchAll(/\sd="([^"]+)"/g)) {
    for (const n of d[1]!.match(/-?\d+(?:\.\d+)?/g) ?? []) assert.ok(Number(n) >= 0 && Number(n) <= 24, `${name} 路径越出画布: ${n}`)
  }
}

test('导出图标、文件类别与技能图标都满足纯线条合同', () => {
  assert.ok(exported.length >= 30, `导出图标数量异常: ${exported.length}`)
  for (const [name, Component] of exported) assertLineIcon(name, render(Component))
  for (const file of fileTypes) assertLineIcon(file, render(icons.FileTypeIcon, { name: file }))
  for (const skill of skills) assertLineIcon(skill, render((icons.skillGlyphForName as (n: string) => unknown)(skill)))
})

test('每个几何都被至少一个入口使用，且尺寸档与镜像生效', () => {
  const used = new Set<string>()
  const collect = (markup: string) => { for (const m of markup.matchAll(/li li-([A-Za-z]+)/g)) used.add(m[1]!) }
  for (const [, Component] of exported) collect(render(Component))
  for (const file of fileTypes) collect(render(icons.FileTypeIcon, { name: file }))
  for (const skill of skills) collect(render((icons.skillGlyphForName as (n: string) => unknown)(skill)))
  collect(render(icons.FolderIcon, { open: true }))
  collect(render(icons.ChevronIcon, { open: false }))
  assert.deepEqual(Object.keys(GLYPHS).filter(name => !used.has(name)), [], '存在没有入口的几何')

  assert.match(render(icons.SearchIcon), /width="20" height="20"/)
  assert.match(render(icons.CopyIcon), /width="16" height="16"/)
  // 铺满 ↔ 还原：collapse 与 expand 同尺寸档、同一对 m-in / m-out 动效部件
  assert.match(render(icons.CollapseIcon), /width="16" height="16"[^>]*class="lumen-icon li li-collapse"/)
  assert.deepEqual([...render(icons.CollapseIcon).matchAll(/class="(m-[a-z]+)"/g)].map(m => m[1]).sort(), [...render(icons.ExpandIcon).matchAll(/class="(m-[a-z]+)"/g)].map(m => m[1]).sort())
  assert.match(render(icons.GearIcon, { size: 18 }), /width="18" height="18"/)
  assert.match(render(icons.RailIcon), /transform:scaleX\(-1\)/)
})
