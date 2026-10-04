/**
 * [INPUT]: Node 模块钩子与现有 TypeScript 编译器
 * [OUTPUT]: 仅为真实组件测试解析本地扩展名并转换 TSX
 * [POS]: 复用原 UI 回归加载方式；业务 TS 仍由 Node strip-types 加载，不模拟组件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('.') || !context.parentURL?.startsWith('file:')) return nextResolve(specifier, context)
  const path = fileURLToPath(new URL(specifier, context.parentURL))
  for (const candidate of [path, ...['.ts', '.tsx', '/index.ts', '/index.tsx'].map(ext => path + ext)]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return { url: pathToFileURL(candidate).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:')) return nextLoad(url, context)
  const path = fileURLToPath(url)
  if (extname(path) === '.css') return { format: 'module', source: 'export default {}', shortCircuit: true }
  if (extname(path) !== '.tsx' || path.includes('/node_modules/')) return nextLoad(url, context)
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  })
  return { format: 'module', source: compiled.outputText, shortCircuit: true }
}
