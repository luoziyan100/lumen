/**
 * [INPUT]: ZIP 主文档字节与 saxes 命名空间解析器
 * [OUTPUT]: extractDocxText：可取消的 OOXML 主文档正文抽取
 * [POS]: 保留原有段落抽取功能，替换无界解压和 XML 正则，不执行文档实体或宏
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { setImmediate } from 'node:timers/promises'
import { SaxesParser } from 'saxes'
import { readZipEntry } from './zip.ts'

const WORD_NAMESPACES = new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main'])
const MAX_TEXT_CHARS = 2_000_000

export async function extractDocxText(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(await readZipEntry(bytes, 'word/document.xml', signal))
  const parser = new SaxesParser({ xmlns: true })
  const parts: string[] = []
  let textDepth = 0, excluded = 0, size = 0, documentSeen = false
  const append = (text: string) => { size += text.length; if (size > MAX_TEXT_CHARS) throw new Error('DOCX 正文超过字符上限'); parts.push(text) }
  parser.on('doctype', () => { throw new Error('DOCX 不允许 DTD 或外部实体') })
  parser.on('opentag', tag => {
    if (!WORD_NAMESPACES.has(tag.uri)) return
    if (tag.local === 'document') documentSeen = true
    if (tag.local === 'del' || tag.local === 'moveFrom') excluded++
    if (tag.local === 't') textDepth++
    if (!excluded && tag.local === 'tab') append('\t')
    if (!excluded && (tag.local === 'br' || tag.local === 'cr')) append('\n')
  })
  parser.on('text', text => { if (textDepth && !excluded) append(text) })
  parser.on('closetag', tag => {
    if (!WORD_NAMESPACES.has(tag.uri)) return
    if (tag.local === 't') textDepth--
    if (!excluded && (tag.local === 'p' || tag.local === 'tr')) append('\n')
    if (!excluded && tag.local === 'tc') append('\t')
    if (tag.local === 'del' || tag.local === 'moveFrom') excluded--
  })
  for (let offset = 0; offset < xml.length; offset += 65_536) {
    signal?.throwIfAborted(); parser.write(xml.slice(offset, offset + 65_536))
    await setImmediate(undefined, { signal })
  }
  parser.close()
  const text = parts.join('').replace(/\n\t/g, '\t').replace(/\t\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!documentSeen || !text) throw new Error('DOCX 主文档中没有可抽取正文')
  return text
}
