/**
 * [INPUT]: none (pure text rules)
 * [OUTPUT]: readingQuestion (a reading question split into the quoted reading sentence, its place and the person's words; null for any other message), userWords (the part of a user
 *           message that is the person's own words)
 * [POS]: the service's reading of the question format the desktop writes (`MODEL_TEXT.askReading` in ui-client): `> quote` lines, then `— 解读《item》· section`, a blank line, the words.
 *        The quote is the AI's reading sentence, not the user's, so sediment (R13) sees only the words. The desktop keeps its own parser for footprints; ui-client/tests/reading.test.ts
 *        feeds the real askReading output to both and requires the same answer, so the two cannot drift apart silently
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

/** The place line under the quote: the material's title and the section label */
const PLACE = /^— 解读《(.*)》· (.*)$/

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

/** What the person wrote: a reading question's words only (the quote block and place line are the reading's), any other message whole. */
export function userWords(text: string): string {
  return readingQuestion(text)?.words ?? text
}
