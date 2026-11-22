/**
 * [INPUT]: nothing; sample arrays
 * [OUTPUT]: peakDb, rmsDb (gated block loudness), onset (first crossing of a fraction of the peak), pitch (the fundamental near a target, read from its strongest harmonic, parabola-refined)
 * [POS]: the one loudness and timing yardstick of the music set. sampler.ts levels each part with rmsDb and peakDb and finds a recording's attack with onset; the unit tests and the browser checks measure with the same functions,
 *        so "loud enough" means the same thing everywhere. rmsDb averages the power of 50 ms blocks louder than −70 dBFS and within 20 dB of the loudest block, so a tick and a
 *        sustained tone compare by how loud they sound, not by how much silence surrounds them
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-12))

export function peakDb(x: Float32Array) {
  let peak = 0
  for (const v of x) peak = Math.max(peak, Math.abs(v))
  return db(peak)
}

export function rmsDb(x: Float32Array, rate: number) {
  const size = Math.round(rate * .05), blocks: number[] = []
  for (let i = 0; i + size <= x.length; i += size) {
    let p = 0
    for (let k = i; k < i + size; k++) p += x[k]! * x[k]!
    blocks.push(p / size)
  }
  const top = Math.max(...blocks), kept = blocks.filter(p => p > 1e-7 && p >= top / 100)
  return kept.length ? 10 * Math.log10(kept.reduce((a, b) => a + b, 0) / kept.length) : -Infinity
}

/** The first time (s) the signal's magnitude reaches `fraction` of its peak */
export function onset(x: Float32Array, rate: number, fraction = .1) {
  let peak = 0
  for (const v of x) peak = Math.max(peak, Math.abs(v))
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]!) >= peak * fraction) return i / rate
  return -1
}

/** The fundamental within ±6% of `near` Hz, over a Hann window of `size` samples from `from` s: the strongest peak among the first three harmonics' bands, refined by a parabola
 *  through the log magnitudes and divided by its order (a low string's fundamental can lie 20 dB under its second harmonic) */
export function pitch(x: Float32Array, rate: number, near: number, from = 0, size = 16384) {
  const start = Math.round(from * rate), n = Math.min(size, 2 ** Math.floor(Math.log2(Math.max(2, x.length - start))))
  const re = new Float64Array(n), im = new Float64Array(n)
  for (let i = 0; i < n; i++) re[i] = (x[start + i] ?? 0) * (.5 - .5 * Math.cos(2 * Math.PI * i / (n - 1)))
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j]!, re[i]!]; [im[i], im[j]] = [im[j]!, im[i]!] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2, tr = re[q]! * cr - im[q]! * ci, ti = re[q]! * ci + im[q]! * cr
        re[q] = re[p]! - tr; im[q] = im[p]! - ti; re[p]! += tr; im[p]! += ti
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr
      }
    }
  }
  const mag = (k: number) => Math.log(Math.hypot(re[k]!, im[k]!) + 1e-12)
  let best = 1, order = 1, top = -Infinity
  for (let h = 1; h <= 3; h++) {
    const lo = Math.max(1, Math.floor(near * h * .94 * n / rate)), hi = Math.min(n / 2 - 2, Math.ceil(near * h * 1.06 * n / rate))
    for (let k = lo; k <= hi; k++) if (mag(k) > top) { top = mag(k); best = k; order = h }
  }
  const [a, b, c] = [mag(best - 1), mag(best), mag(best + 1)], shift = (a - c) / (2 * (a - 2 * b + c) || 1)
  return (best + shift) * rate / n / order
}
