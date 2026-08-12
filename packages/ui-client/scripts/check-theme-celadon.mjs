/**
 * [INPUT]: node_modules/@cloudflare/kumo theme-kumo.css、src/theme-celadon.css、src/appearance/types.ts 白名单
 * [OUTPUT]: 校验 Kumo 变量名齐全 + 引用链/literalAllowlist + solid 槽不引玻璃半透明
 * [POS]: npm run check:theme · doc/appearance-skin.md D7/R4/R7
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const kumoTheme = join(dirname(require.resolve('@cloudflare/kumo/styles/tailwind')), 'theme-kumo.css')
const celadonPath = join(here, '../src/theme-celadon.css')
const typesPath = join(here, '../src/appearance/types.ts')

const vars = (css) => new Set([...css.matchAll(/--[a-z0-9-]+(?=\s*:)/g)].map((m) => m[0]))
const contract = vars(readFileSync(kumoTheme, 'utf8'))
const celadonCss = readFileSync(celadonPath, 'utf8')
const celadon = vars(celadonCss)

const exempt = (name) => /^--text-(base|sm|lg|xs)/.test(name)

// 允许字面量的 Kumo 键（badge / 阴影等无 Lumen 对等）
const literalAllowlist = new Set([
  '--color-kumo-shadow-drop',
  '--color-kumo-shadow-edge',
  '--color-kumo-tip-shadow',
  '--color-kumo-badge-blue',
  '--color-kumo-badge-green',
  '--color-kumo-badge-red',
  '--color-kumo-badge-orange',
  '--color-kumo-badge-purple',
  '--color-kumo-badge-teal',
  '--color-kumo-badge-neutral',
])

// Solid 槽：禁止引用玻璃半透明族
const solidSlotList = new Set([
  '--color-kumo-canvas',
  '--color-kumo-base',
  '--color-kumo-elevated',
  '--color-kumo-recessed',
  '--color-kumo-control',
  '--color-kumo-fill',
  '--color-kumo-fill-hover',
  '--color-kumo-interact',
  '--color-kumo-tint',
  '--color-kumo-brand',
  '--color-kumo-brand-hover',
  '--color-kumo-danger',
  '--color-kumo-warning',
  '--color-kumo-success',
  '--color-kumo-info',
])

const glassForbidden = new Set([
  '--paper',
  '--card',
  '--vellum',
  '--paper-deep',
  '--paper-solid',
])

const missing = [...contract].filter((v) => !exempt(v) && !celadon.has(v))
const extra = [...celadon].filter((v) => !contract.has(v))

// 解析 celadon 内每个 --x: value
const declRe = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g
const decls = new Map()
let m
while ((m = declRe.exec(celadonCss))) {
  decls.set(m[1], m[2].trim())
}

const refOk = (val) => /^var\(\s*--[a-z0-9-]+\s*\)$/i.test(val.replace(/\s+/g, ' ').trim())
const refTarget = (val) => {
  const mm = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(val.replace(/\s+/g, ' ').trim())
  return mm ? mm[1] : null
}

const badRef = []
const solidGlass = []
for (const [name, val] of decls) {
  if (exempt(name)) continue
  if (literalAllowlist.has(name)) continue
  if (!refOk(val) && !literalAllowlist.has(name)) {
    // 允许 rgba(...) 仅当在 allowlist；否则必须 var()
    if (!refOk(val)) badRef.push(`${name}: ${val}`)
  }
  if (solidSlotList.has(name)) {
    const t = refTarget(val)
    if (t && glassForbidden.has(t)) solidGlass.push(`${name} → ${t}`)
  }
}

// R7：types 白名单须含全部 --surface-*
const typesSrc = readFileSync(typesPath, 'utf8')
const surfaceKeys = [
  '--surface-canvas',
  '--surface-base',
  '--surface-elevated',
  '--surface-recessed',
  '--surface-control',
  '--surface-fill',
  '--surface-fill-hover',
  '--surface-interact',
]
const missingSurface = surfaceKeys.filter((k) => !typesSrc.includes(`'${k}'`))

let failed = false
if (extra.length) console.log('青瓷主题中多余(合同外)的变量:', extra.join(', '))
if (missing.length) {
  console.error('✗ 缺少 Kumo 合同变量:')
  for (const v of missing) console.error('  ' + v)
  failed = true
}
if (badRef.length) {
  console.error('✗ 须为 var(--*) 或 literalAllowlist 的键:')
  for (const v of badRef) console.error('  ' + v)
  failed = true
}
if (solidGlass.length) {
  console.error('✗ Solid 槽引用了玻璃半透明 token:')
  for (const v of solidGlass) console.error('  ' + v)
  failed = true
}
if (missingSurface.length) {
  console.error('✗ 白名单缺少 --surface-* 伴生键:')
  for (const v of missingSurface) console.error('  ' + v)
  failed = true
}

if (failed) process.exit(1)
console.log(
  `✓ 青瓷桥校验通过:合同 ${[...contract].filter((v) => !exempt(v)).length} 键;` +
  `引用/allowlist OK;solid 无玻璃泄漏;surface 白名单完备`,
)
