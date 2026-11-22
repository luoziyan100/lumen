/**
 * [INPUT]: r from ./line.ts
 * [OUTPUT]: LEAD, cycle(run) (a lead, a pass and its rest: rest = max(run, 4 s), total = lead + run + rest), restFrames(frames, each, cycle, times) (a @keyframes block re-timed to
 *           play inside the pass, then hold)
 * [POS]: the rhythm of every lasting motion of the music set. A loop does not run forever: it plays one pass, then holds its rest pose for at least as long as the pass and at least 4 s,
 *        and its sound rests with it. Each iteration opens with a still lead (LEAD, 80 ms) holding the first frame: the sound engine reads the animation's start only once it runs,
 *        and the lead lets it schedule the pass's first cue ahead of the motion instead of after it. A cue's time counts from the end of the lead.
 *        restFrames takes keyframes written for one period of `each` seconds, lays `times` periods after the lead (or one period at each given start, in s, a period cut where the
 *        next begins) and repeats the last frame at 100%, so the rest pose is the keyframes' own last frame. Seconds inside a period never change, only the percentages
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { r } from './line.ts'

export const LEAD = .08
export interface Cycle { lead: number; run: number; rest: number; total: number }
export const cycle = (run: number): Cycle => { const rest = r(Math.max(run, 4)); return { lead: LEAD, run, rest, total: r(LEAD + run + rest) } }

export function restFrames(frames: string, each: number, c: Cycle, times: number | number[] = 1) {
  const head = frames.match(/@keyframes\s+[\w-]+\s*\{/)
  if (!head) throw new Error('not a @keyframes block')
  const stops = [...frames.slice(head.index! + head[0].length).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    at: sel!.split(',').map(s => s.trim()).map(s => s === 'from' ? 0 : s === 'to' ? 100 : Number(s.replace('%', ''))),
    body: body!.trim(),
  }))
  const starts = typeof times === 'number' ? Array.from({ length: times }, (_, k) => k * each) : times
  let out = `0% { ${stops[0]!.body} } `
  starts.forEach((start, k) => {
    const until = starts[k + 1] ?? Infinity
    for (const stop of stops) {
      const at = stop.at.map(p => start + p / 100 * each).filter(t => t < until || (t === until && typeof times === 'number'))
      if (at.length) out += `${at.map(t => `${r((c.lead + t) / c.total * 100)}%`).join(', ')} { ${stop.body} } `
    }
  })
  return `${head[0]} ${out}100% { ${stops.at(-1)!.body} } }\n`
}
