/**
 * [INPUT]: 当前工作树改动清单、生产前端与原生应用的可打印字符串
 * [OUTPUT]: auditNaming：返回违反精灵命名合同的文件，供浏览器与原生验收共用
 * [POS]: 验收工具的静态审计，不进入产品构建
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
const forbidden = new RegExp('\\b' + ['p', 'e', 't'].join('') + '\\b', 'i')
function textFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? textFiles(path) : /\.(?:js|css|html)$/.test(path) ? [path] : []
  })
}
export function auditNaming() {
  const changed = ['diff --name-only da6519c', 'ls-files --others --exclude-standard'].flatMap(command => execFileSync('git', command.split(' '), { encoding: 'utf8' }).trim().split('\n'))
  const source = [...new Set(changed)].filter(path => existsSync(path) && /\.(?:[cm]?[jt]sx?|css|json|md|rs|toml|lock|swift)$/.test(path))
  const dist = 'packages/ui-client/dist'
  const paths = [...source, ...(existsSync(dist) ? textFiles(dist) : [])]
  const matches = paths.filter(path => forbidden.test(readFileSync(path, 'utf8')))
  const binary = 'packages/ui-client/src-tauri/target/release/bundle/macos/Lumen.app/Contents/MacOS/Lumen'
  if (existsSync(binary) && forbidden.test(execFileSync('strings', ['-a', binary], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))) matches.push(binary)
  return matches
}
