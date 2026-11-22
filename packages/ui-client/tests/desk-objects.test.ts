/**
 * [INPUT]: the desk-object registry (buildDeskObject, deskKit, DESK_SLOTS), MUSIC_OBJECTS and the structure constants of objects/music/, count from music/line.ts, normalizeAppearance,
 *          the real PreferencePane under useAppearance, DeskKitProvider/DeskObject and HOVER_CONFIRM, slotSamples and the sample manifest of music/; an AudioContext stand-in that counts
 *          contexts and sources and decodes anything, a fetch stand-in that records each request and answers 404 for one chosen recording, console.warn captured
 * [OUTPUT]: evidence that every slot builds in both kits and unknown kits fall back to instruments; missing or bad preference fields fall back to instruments with sound off;
 *           every music object is well-formed XML with its own id prefix (all eight mount together without a clash) and meets its primitive floor; the box's words are escaped;
 *           the piano draws 52 white and 36 black keys, violin and cello 4 strings, the harp ≥30; the settings group switches and persists the kit and enables sound only under Music;
 *           data-hover appears only after the pointer stays 100 ms and a shorter pass leaves none; switched off (or the instrument kit) nothing is requested and no AudioContext is made;
 *           found on at start, nothing loads before the first pointerdown, which unlocks and loads each recording of the slot in view once; a missing recording writes one console line;
 *           motion before the unlock is never replayed; a click (even before the hover is confirmed) plays one source per cue of the slot's open score
 * [POS]: the mechanism tests of the second desk-object kit. Layout, motion, frames and real audio are browser facts, covered by scripts/sprite/ui-assert-objects.mts
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'
import { zh } from './helpers/zh.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLButtonElement', 'Element', 'Node', 'NodeFilter', 'DocumentFragment', 'MutationObserver', 'localStorage', 'getComputedStyle', 'DOMParser', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
after(() => dom.window.close())

const audio = { contexts: 0, sources: 0, fetched: [] as string[], warnings: [] as string[], missing: '' }
const param = () => ({ value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} })
const node = () => ({ connect() {} })
class CountingAudioContext {
  currentTime = 0
  sampleRate = 44100
  state = 'running'
  destination = {}
  constructor() { audio.contexts++ }
  resume() { return Promise.resolve() }
  suspend() { return Promise.resolve() }
  decodeAudioData() { const data = new Float32Array(4410).fill(.2); return Promise.resolve({ sampleRate: 44100, duration: .1, getChannelData: () => data }) }
  createBufferSource() { audio.sources++; return { ...node(), buffer: null, playbackRate: param(), detune: param(), start() {}, stop() {} } }
  createGain() { return { ...node(), gain: param() } }
  createBiquadFilter() { return { ...node(), type: '', frequency: param() } }
  createOscillator() { return { ...node(), frequency: param(), start() {}, stop() {} } }
}
const fetchStub = (url: string) => {
  audio.fetched.push(url)
  const missing = !!audio.missing && url.includes(audio.missing)
  return Promise.resolve({ ok: !missing, status: missing ? 404 : 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })
}
Object.assign(globalThis, { AudioContext: CountingAudioContext, fetch: fetchStub })
console.warn = (...line: unknown[]) => { audio.warnings.push(line.join(' ')) }

register('./helpers/tsx-loader.mjs', import.meta.url)
const { createRoot } = await import('react-dom/client')
const { buildDeskObject, deskKit, DESK_SLOTS } = await import('../src/mastra/studio/objects/registry.ts')
const { MUSIC_OBJECTS, MUSIC_SCORES, PIANO_KEYS, VIOLIN_STRINGS, CELLO_STRINGS, HARP_STRINGS } = await import('../src/mastra/studio/objects/music/index.ts')
const { count } = await import('../src/mastra/studio/objects/music/line.ts')
const { normalizeAppearance, useAppearance, APPEARANCE_STORAGE_KEY } = await import('../src/appearance/index.ts')
const { PreferencePane } = await import('../src/mastra/views/chrome/Appearance.tsx')
const { DeskKitProvider, DeskObject } = await import('../src/mastra/studio/objects/DeskObject.tsx')
const { HOVER_CONFIRM } = await import('../src/mastra/studio/objects/IsoObject.tsx')
const { slotSamples } = await import('../src/mastra/studio/objects/music/sampler.ts')
const { SAMPLES, sampleFor } = await import('../src/mastra/studio/objects/music/samples.ts')

const S = zh.studio
const input = { title: 'Attention <Is> All & You Need', words: { stamp: '11-21', lines: [`</text><text x="0">forged & "q"`] }, labels: S.objects }
const parse = (markup: string) => new DOMParser().parseFromString(markup, 'image/svg+xml')
const MUSIC_PREFIX: Record<string, string> = { reading: 'pn-', board: 'ms-', takeaways: 'gr-', materials: 'cl-', box: 'mb-', map: 'hp-', ideas: 'vn-', all: 'mt-' }

test('registry: every slot builds in both kits; an unknown kit falls back to instruments', () => {
  assert.deepEqual([...DESK_SLOTS].sort(), ['all', 'board', 'box', 'ideas', 'map', 'materials', 'reading', 'takeaways'])
  for (const slot of DESK_SLOTS) {
    const instrument = buildDeskObject('instruments', slot, input), music = buildDeskObject('music', slot, input)
    assert.ok(instrument.startsWith('<svg') && music.startsWith('<svg'), slot)
    assert.notEqual(instrument, music, `${slot}: the kits differ`)
    assert.match(music, /class="mu /, `${slot}: the music kit builds a music object`)
    for (const bad of [undefined, null, 'Music', 'organ', 7]) assert.equal(buildDeskObject(bad, slot, input), instrument, `${slot}: ${String(bad)} falls back`)
  }
  assert.equal(deskKit('music'), 'music')
  assert.equal(deskKit('anything'), 'instruments')
})

test('appearance: missing or bad desk-object fields fall back to instruments with sound off', () => {
  for (const raw of [null, {}, { deskObjects: 'organ', instrumentSounds: 'yes' }, { deskObjects: 3, instrumentSounds: 1 }]) {
    const state = normalizeAppearance(raw)
    assert.equal(state.deskObjects, 'instruments')
    assert.equal(state.instrumentSounds, false)
  }
  const kept = normalizeAppearance({ deskObjects: 'music', instrumentSounds: true })
  assert.equal(kept.deskObjects, 'music')
  assert.equal(kept.instrumentSounds, true)
})

test('music objects: well-formed XML, own id prefixes, escaped box words, primitive floors', () => {
  const ids = new Set<string>()
  for (const o of MUSIC_OBJECTS) {
    const markup = o.svg({ words: input.words }), doc = parse(markup)
    assert.equal(doc.querySelector('parsererror'), null, `${o.slot} parses`)
    assert.equal(doc.querySelectorAll('image, script, foreignObject').length, 0, `${o.slot}: no bitmap or script`)
    assert.doesNotMatch(markup, /blur|<filter/i, `${o.slot}: no blur filter`)
    for (const node of doc.querySelectorAll('[id]')) {
      assert.ok(node.id.startsWith(MUSIC_PREFIX[o.slot]!), `${o.slot}: id ${node.id} carries its prefix`)
      assert.ok(!ids.has(node.id), `id ${node.id} is unique across the set`)
      ids.add(node.id)
    }
    assert.ok(count(markup) >= (o.width === 640 ? 400 : 200), `${o.slot}: ${count(markup)} primitives`)
    const tiers = new Set(markup.match(/\bw[0-3]\b/g))
    assert.ok(tiers.size >= 3, `${o.slot}: at least three line weights`)
    assert.ok([...doc.querySelectorAll('text')].some(t => t.textContent === o.label), `${o.slot}: carries its plate ${o.label}`)
  }
  const box = buildDeskObject('music', 'box', input)
  assert.equal(parse(box).querySelector('parsererror'), null)
  assert.ok([...parse(box).querySelectorAll('text')].some(t => t.textContent === input.words.lines[0]), 'the card line reads back as written text')
  assert.equal(parse(box).querySelectorAll('text[x="0"]').length, 0, 'nothing forged')
})

test('structure: 52 white and 36 black keys, four strings on violin and cello, at least thirty on the harp', () => {
  const svg = (slot: string) => parse(MUSIC_OBJECTS.find(o => o.slot === slot)!.svg({}))
  assert.equal(PIANO_KEYS.white, 52)
  assert.equal(PIANO_KEYS.black, 36)
  assert.equal(svg('reading').querySelectorAll('.pn-k').length, 52)
  assert.equal(svg('reading').querySelectorAll('.pn-bk').length, 36)
  assert.equal(VIOLIN_STRINGS, 4)
  assert.equal(CELLO_STRINGS, 4)
  assert.equal(svg('ideas').querySelectorAll('g.vn-s').length, 4)
  assert.equal(svg('materials').querySelectorAll('g.cl-s').length, 4)
  assert.ok(HARP_STRINGS >= 30)
  assert.equal(svg('map').querySelectorAll('g.hp-s').length, HARP_STRINGS)
})

async function mount(node: ReturnType<typeof createElement>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => { root.render(node) })
  return { host, unmount: () => act(async () => { root.unmount(); host.remove() }) }
}

test('settings: the desk-object group switches and persists the kit; sound is enabled only under Music', async () => {
  localStorage.clear()
  function Panel() { const appearance = useAppearance(); return createElement(PreferencePane, { state: appearance.state, onChange: appearance.setAppearance }) }
  const { host, unmount } = await mount(createElement(Panel))
  const A = zh.appearance
  const group = host.querySelector(`[aria-label="${A.deskObjects}"]`)!
  const button = (label: string) => [...group.querySelectorAll('button')].find(b => b.textContent === label)!
  const sound = [...host.querySelectorAll('label')].find(l => l.textContent === A.instrumentSounds)!.querySelector('input')!
  assert.equal(button(A.deskKits.instruments).getAttribute('aria-pressed'), 'true')
  assert.equal(sound.disabled, true)
  await act(async () => { button(A.deskKits.music).click() })
  assert.equal(button(A.deskKits.music).getAttribute('aria-pressed'), 'true')
  assert.equal(sound.disabled, false)
  assert.equal(sound.checked, false)
  await act(async () => { sound.click() })
  const saved = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!)
  assert.equal(saved.deskObjects, 'music')
  assert.equal(saved.instrumentSounds, true)
  await act(async () => { button(A.deskKits.instruments).click() })
  assert.equal(sound.disabled, true)
  assert.equal(sound.checked, false)
  await unmount()
})

const wait = (ms: number) => act(() => new Promise<void>(resolve => setTimeout(resolve, ms)))
const over = (object: Element, type: 'pointerover' | 'pointerout') => object.dispatchEvent(new window.MouseEvent(type, { bubbles: true, relatedTarget: document.body }))

test('hover: data-hover only after the pointer stays 100 ms; leaving sooner cancels it', async () => {
  const { host, unmount } = await mount(createElement(DeskKitProvider, { kit: 'music', sounds: false }, createElement(DeskObject, { slot: 'reading', className: 'reading-typewriter' })))
  const object = host.querySelector('.iso-host')!
  await act(async () => { over(object, 'pointerover') })
  await wait(HOVER_CONFIRM / 2)
  await act(async () => { over(object, 'pointerout') })
  await wait(HOVER_CONFIRM)
  assert.equal(object.hasAttribute('data-hover'), false, 'a pointer passing over moves nothing')
  await act(async () => { over(object, 'pointerover') })
  await wait(HOVER_CONFIRM + 20)
  assert.equal(object.hasAttribute('data-hover'), true, 'a pointer that stays confirms the hover')
  await act(async () => { over(object, 'pointerout') })
  assert.equal(object.hasAttribute('data-hover'), false, 'leaving clears it at once')
  await unmount()
})

test('sound: off requests nothing; on at start waits for the first gesture; recordings load per slot; a missing one is one console line; a click plays the open score', async () => {
  const click = (object: HTMLElement) => act(async () => { object.click() })
  const desk = (kit: string, sounds: boolean) => createElement(DeskKitProvider, { kit, sounds }, createElement(DeskObject, { slot: 'reading', className: 'reading-typewriter' }))
  for (const [kit, sounds] of [['music', false], ['instruments', true]] as const) {
    const { host, unmount } = await mount(desk(kit, sounds))
    const object = host.querySelector('.iso-host') as HTMLElement
    assert.equal(object.getAttribute('aria-hidden'), 'true')
    await click(object)
    assert.equal(object.hasAttribute('data-open'), true)
    if (kit === 'music') assert.match(object.innerHTML, /mu-piano/)
    await unmount()
  }
  assert.deepEqual([audio.contexts, audio.sources, audio.fetched.length], [0, 0, 0], 'off, or the instrument kit: no AudioContext, no request')
  const opening = MUSIC_SCORES.reading.open.map((cue: any) => sampleFor(cue).name), names = slotSamples('reading'), lost = names.find(name => !opening.includes(name))!
  audio.missing = SAMPLES[lost]!.url
  const { host, unmount } = await mount(desk('music', true))
  const object = host.querySelector('.iso-host') as HTMLElement
  await click(object)
  await click(object)
  assert.deepEqual([audio.contexts, audio.fetched.length], [0, 0], 'found on at start: nothing before the first pointerdown')
  await act(async () => { window.dispatchEvent(new window.MouseEvent('pointerdown')) })
  await wait(20)
  assert.equal(audio.contexts, 1, 'the first gesture unlocks')
  assert.deepEqual(audio.fetched.sort(), names.map(name => SAMPLES[name]!.url).sort(), 'the slot in view loads each of its recordings once')
  assert.equal(audio.warnings.length, 1, 'a missing recording writes one console line')
  assert.match(audio.warnings[0]!, new RegExp(lost))
  assert.equal(audio.sources, 0, 'motion before the unlock is never replayed')
  await click(object)
  assert.equal(object.hasAttribute('data-open'), true)
  assert.equal(audio.sources, MUSIC_SCORES.reading.open.length, 'the opening click plays one source per cue of the piano score')
  await unmount()
})
