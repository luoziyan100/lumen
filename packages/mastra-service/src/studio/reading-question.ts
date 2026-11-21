/**
 * [INPUT]: none (pure text rules)
 * [OUTPUT]: readingQuestion (a reading question split into the quoted reading sentence, its place and the person's words; null for any other message), userWords (the part of a user
 *           message that is the person's own words: empty for a message the program or a widget wrote)
 * [POS]: the service's reading of the messages the desktop writes for the person (`MODEL_TEXT` in ui-client): a reading question (`> quote` lines, `— 解读《item》· section`,
 *        a blank line, the words), the request to write a reading, a widget's message (`— 小实验`, a blank line, the text), the diagram and widget fix requests, and the uploaded-material
 *        list appended to a typed message. Only typed words are the user's, so sediment (R13) sees nothing else. The desktop keeps its own parser for footprints;
 *        ui-client/tests/reading.test.ts feeds the real MODEL_TEXT output to both and requires the same answer, so the two cannot drift apart silently
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

/** The place line under the quote: the material's title and the section label */
const PLACE = /^— 解读《(.*)》· (.*)$/

/** Whole messages the program writes in the person's name: they carry no words of the person */
const PROGRAM = [
  /^请为《[\s\S]*》写一份解读。（材料 id：[^）]*）$/, // the Materials row's 「写解读」
  /^— 小实验\n/, // a widget's message, sent only right after the person touched the widget
  /^上面回复里的这张 Mermaid 图无法渲染，解析错误：/, // the automatic diagram fix request
  /^解读里的小实验运行出错：/,
]

/** Appended after the typed words when files were uploaded with them; the list is the program's */
const MATERIALS = '\n\n已上传材料（资料库条目，用 read_material 读）：\n'

export interface ReadingQuestion { quote: string; item: string; section: string; words: string }

export function readingQuestion(text: string): ReadingQuestion | null {
  const lines = text.split('\n')
  let at = 0
  const quote: string[] = []
  while (at < lines.length && lines[at]!.startsWith('> ')) quote.push(lines[at++]!.slice(2))
  const place = quote.length ? PLACE.exec(lines[at] ?? '') : null
  if (!place) return null
  return { quote: quote.join(' ').replace(/\s+/g, ' ').trim(), item: place[1]!, section: place[2]!, words: lines.slice(at + 1).join('\n').trim() }
}

/** What the person wrote: a reading question's words only (the quote block and place line are the reading's), nothing of a program-written message,
 *  and a typed message without the material list the upload appended. */
export function userWords(text: string): string {
  if (PROGRAM.some(form => form.test(text))) return ''
  const question = readingQuestion(text)
  if (question) return question.words
  const list = text.lastIndexOf(MATERIALS)
  return (list < 0 ? text : text.slice(0, list)).trim()
}
