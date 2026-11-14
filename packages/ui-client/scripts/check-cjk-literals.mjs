/**
 * [INPUT]: every .ts/.tsx under src/ except src/i18n/locales/ (and an optional extra root, for the self-test), parsed with the TypeScript API
 * [OUTPUT]: exit 1 listing file:line for each string literal, template piece or JSX text that contains a CJK character; exit 0 when clean
 * [POS]: npm run check:i18n (part of npm run verify) · i18n I5: user-facing text lives only in the locale catalogs. Comments are not checked;
 *        escapes such as '\u4e00' in source are not CJK characters and pass
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '../src')
const exempt = join(src, 'i18n', 'locales') + sep
// Han, CJK punctuation, kana, Hangul, fullwidth forms
const CJK = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return (path + sep).startsWith(exempt) ? [] : files(path)
    return /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : []
  })
}

function findings(path) {
  const text = readFileSync(path, 'utf8')
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found = []
  const visit = node => {
    const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)
    if (literal) {
      const raw = text.slice(node.getStart(file), node.getEnd())
      if (CJK.test(raw)) found.push(`${relative(join(here, '..'), path)}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}  ${raw.trim().slice(0, 60)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

const roots = [src, ...process.argv.slice(2)]
const all = roots.flatMap(root => files(root)).flatMap(findings)
if (all.length) {
  console.error(`check:i18n — ${all.length} CJK literal(s) outside src/i18n/locales/:\n${all.join('\n')}`)
  process.exit(1)
}
console.log('check:i18n — no CJK literals outside src/i18n/locales/')
