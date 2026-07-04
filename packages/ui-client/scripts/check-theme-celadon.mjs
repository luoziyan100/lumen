/**
 * [INPUT]: node_modules/@cloudflare/kumo/dist/styles/theme-kumo.css(变量合同)、src/theme-celadon.css
 * [OUTPUT]: 校验青瓷主题对 Kumo 变量合同的覆盖完整性;缺失即非零退出
 * [POS]: 主题派生纪律的执法者——升级 @cloudflare/kumo 后必跑(npm run check:theme)
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const kumoTheme = join(dirname(require.resolve('@cloudflare/kumo/styles/tailwind')), 'theme-kumo.css')

const vars = (css) => new Set([...css.matchAll(/--[a-z0-9-]+(?=\s*:)/g)].map((m) => m[0]))
const contract = vars(readFileSync(kumoTheme, 'utf8'))
const celadon = vars(readFileSync(join(here, '../src/theme-celadon.css'), 'utf8'))

// 字号 token(--text-base/sm/lg/xs 及行高)沿用 Kumo 默认,不属于颜色合同
const exempt = (name) => /^--text-(base|sm|lg|xs)/.test(name)

const missing = [...contract].filter((v) => !exempt(v) && !celadon.has(v))
const extra = [...celadon].filter((v) => !contract.has(v))

if (extra.length) console.log('青瓷主题中多余(合同外)的变量:', extra.join(', '))
if (missing.length) {
  console.error('✗ 青瓷主题缺少以下 Kumo 合同变量(升级 kumo 引入了新 token?):')
  for (const v of missing) console.error('  ' + v)
  process.exit(1)
}
console.log(`✓ 青瓷主题覆盖完整:${[...contract].filter((v) => !exempt(v)).length} 个合同变量全部就位`)
