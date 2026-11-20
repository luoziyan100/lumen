/**
 * [INPUT]: @excalidraw/excalidraw's convertToExcalidrawElements, newElementWith, reconcileElements, restoreElements and getSceneVersion; the canvas DTOs from data/client
 * [OUTPUT]: Ledger (which element versions the service already has; what to save next), mergeRemote (the service's elements into the local scene by
 *           reconcile, `kept` copies forced), layOutOp (an AI op as the elements to commit), viewportOf (the scene rectangle on screen), sceneVersion
 * [POS]: the sync rules of BoardCanvas, kept out of React so the interleaved-write test runs them against the real library. The service is the truth for
 *        what was saved; the scene is the truth for what the user sees. An AI op is laid out here and committed before it reaches the scene, so the
 *        user's next save never claims the AI's strokes. It measures text with whatever fonts the page has: BoardCanvas loads them first
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { convertToExcalidrawElements, getSceneVersion, newElementWith, reconcileElements, restoreElements } from '@excalidraw/excalidraw'
import type { ExcalidrawElement, ExcalidrawTextElement, OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'
import type { CanvasElement, CanvasOp, Viewport } from '../data/client.ts'

type Skeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number]
type Remote = Parameters<typeof reconcileElements>[1][number]
/** A skeleton as the service stored it: always with an id, arrow ends by id only */
type Stored = Record<string, unknown> & { id: string; type: string; start?: { id: string }; end?: { id: string }; children?: string[] }
type Patch = Record<string, unknown> & { id: string; text?: string }

// Arrows bind to these; a copy of an existing one rides in the batch so Excalidraw computes the binding (see layOutOp)
const BINDABLE = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'image'])

/** Which element versions the service has. Everything newer in the scene is the user's unsaved work. */
export class Ledger {
  private readonly known = new Map<string, number>()
  remember(elements: readonly { id: string; version: number }[]) {
    for (const element of elements) if ((this.known.get(element.id) ?? -1) < element.version) this.known.set(element.id, element.version)
  }
  /** The scene's elements the service has not seen at this version (tombstones too: a delete is a save). */
  unsent<T extends { id: string; version: number }>(elements: readonly T[]): T[] {
    return elements.filter(element => element.version > (this.known.get(element.id) ?? 0))
  }
  clear() { this.known.clear() }
}

/**
 * The service's elements into the local scene. Reconcile keeps the higher version and leaves an element the user is editing alone;
 * `kept` are copies the service holds at the same version as ours and chose over them, so they replace ours whatever reconcile would say.
 */
export function mergeRemote(local: readonly OrderedExcalidrawElement[], remote: readonly CanvasElement[], appState: AppState, kept: readonly CanvasElement[] = []): OrderedExcalidrawElement[] {
  const merged = reconcileElements(local, asStored(remote, true) as unknown as Remote[], appState) as unknown as OrderedExcalidrawElement[]
  if (!kept.length) return merged
  const forced = new Map(asStored(kept, false).map(element => [element.id, element]))
  return merged.map(element => forced.get(element.id) ?? element)
}

/**
 * The service's elements in Excalidraw's shape, at the version the service holds. Restoring fills missing fields and gives an element without a
 * fractional index one, and that bumps its version: a remote copy would then outrank the user's newer edit at random, so the stored version stays.
 */
function asStored(elements: readonly CanvasElement[], repairBindings: boolean): OrderedExcalidrawElement[] {
  const stored = new Map(elements.map(element => [element.id, element]))
  return (restoreElements(elements as unknown as ExcalidrawElement[], null, { repairBindings }) as unknown as OrderedExcalidrawElement[]).map(element => {
    const original = stored.get(element.id)
    return original ? { ...element, version: original.version, versionNonce: original.versionNonce ?? element.versionNonce } as OrderedExcalidrawElement : element
  })
}

/**
 * One AI op as the elements to commit. A draw converts its skeletons with their stored ids; an arrow to an element already on the canvas binds
 * through a copy of that element in the same batch (Excalidraw binds only within a batch), and the real element only gains the arrow in its
 * bound list. A frame's children already on the canvas gain the frame id. An update patches the AI's own elements; text is re-measured.
 * Elements the op names that are gone from the scene are skipped: no AI path brings a tombstone back.
 */
export function layOutOp(op: CanvasOp, scene: readonly ExcalidrawElement[]): ExcalidrawElement[] {
  const live = new Map(scene.filter(element => !element.isDeleted).map(element => [element.id, element]))
  if (op.kind === 'update') return (op.patches as Patch[]).flatMap(patch => {
    const current = live.get(patch.id)
    if (!current) return []
    const { id: _id, text, ...fields } = patch
    if (text === undefined || current.type !== 'text') return [newElementWith(current, fields as never)]
    return remeasured(newElementWith(current, { ...fields, text, originalText: text } as never) as ExcalidrawTextElement, live)
  })

  const skeletons = op.skeletons as Stored[], batch = new Set(skeletons.map(skeleton => skeleton.id))
  const outside = new Set<string>()
  for (const skeleton of skeletons) for (const end of [skeleton.start, skeleton.end]) {
    const target = end && !batch.has(end.id) ? live.get(end.id) : undefined
    if (target && BINDABLE.has(target.type)) outside.add(target.id)
  }
  const input = [...[...outside].map(id => copyOf(live.get(id)!) as Stored), ...skeletons.map(withoutForeignEnds(batch, outside))]
  // Pass one finds where each shape lands (labels grow their shapes); pass two aims every connector from shape to shape, as Excalidraw
  // binds an end only when the arrow reaches toward its element
  const where = new Map(convertToExcalidrawElements(input as unknown as Skeleton[], { regenerateIds: false }).map(element => [element.id, element]))
  const converted = convertToExcalidrawElements(input.map(skeleton => aimed(skeleton, where)) as unknown as Skeleton[], { regenerateIds: false })
  const bound = new Map(converted.filter(element => outside.has(element.id)).map(element => [element.id, element.boundElements ?? []]))
  const drawn = converted.filter(element => !outside.has(element.id) && !(element.type === 'text' && element.containerId && outside.has(element.containerId)))
  const touched = [...outside].map(id => {
    const current = live.get(id)!, added = (bound.get(id) ?? []).filter(item => !(current.boundElements ?? []).some(have => have.id === item.id))
    return added.length ? newElementWith(current, { boundElements: [...current.boundElements ?? [], ...added] }) : null
  }).filter((element): element is ExcalidrawElement => !!element)
  // A frame's children drawn earlier take the new frame's id
  const framed = skeletons.filter(skeleton => skeleton.type === 'frame').flatMap(frame => (frame.children ?? [])
    .filter(child => !batch.has(child) && live.has(child)).map(child => newElementWith(live.get(child)!, { frameId: frame.id })))
  return [...drawn, ...touched, ...framed]
}

/** New words measured the way a draw measures them: a label through its container (which may grow), free text on its own. */
function remeasured(text: ExcalidrawTextElement, live: Map<string, ExcalidrawElement>): ExcalidrawElement[] {
  const typography = { fontSize: text.fontSize, fontFamily: text.fontFamily, textAlign: text.textAlign, verticalAlign: text.verticalAlign, strokeColor: text.strokeColor }
  const container = text.containerId ? live.get(text.containerId) : undefined
  if (!container) {
    const [fresh] = convertToExcalidrawElements([{ type: 'text', id: text.id, x: text.x, y: text.y, text: text.text, ...typography }] as unknown as Skeleton[], { regenerateIds: false })
    return [{ ...text, width: fresh!.width, height: fresh!.height } as ExcalidrawElement]
  }
  const fresh = convertToExcalidrawElements([{ ...copyOf(container), label: { text: text.text, ...typography } }] as unknown as Skeleton[], { regenerateIds: false })
  const shape = fresh.find(element => element.id === container.id)!, label = fresh.find(element => element.type === 'text')!
  const laid = { ...text, x: label.x, y: label.y, width: label.width, height: label.height } as ExcalidrawElement
  return shape.height !== container.height ? [laid, newElementWith(container, { height: shape.height })] : [laid]
}

/** A connector between two shapes runs centre to centre unless the AI gave its own points; one bound end starts at that shape's centre. */
function aimed(skeleton: Stored, where: Map<string, ExcalidrawElement>): Stored {
  if ((skeleton.type !== 'arrow' && skeleton.type !== 'line') || skeleton.points || (!skeleton.start && !skeleton.end)) return skeleton
  const centre = (end?: { id: string }) => {
    const element = end ? where.get(end.id) : undefined
    return element ? [element.x + element.width / 2, element.y + element.height / 2] as const : null
  }
  const width = typeof skeleton.width === 'number' ? skeleton.width : 100, height = typeof skeleton.height === 'number' ? skeleton.height : 0
  const from = centre(skeleton.start), to = centre(skeleton.end)
  const [x, y] = from ?? [skeleton.x as number, skeleton.y as number]
  const [x2, y2] = to ?? (from ? [x + width, y + height] : [x + width, y + height])
  return { ...skeleton, x, y, width: x2 - x, height: y2 - y, points: [[0, 0], [x2 - x, y2 - y]] }
}

/** The geometry Excalidraw needs to bind an arrow to an element it does not have in the batch. */
function copyOf(element: ExcalidrawElement): Record<string, unknown> {
  const base = { type: element.type, id: element.id, x: element.x, y: element.y, width: element.width, height: element.height, angle: element.angle }
  if (element.type === 'text') return { ...base, text: element.text, fontSize: element.fontSize, fontFamily: element.fontFamily }
  if (element.type === 'image') return { ...base, fileId: element.fileId }
  return base
}

/** An end the service accepted but the scene lacks (an op laid out late, after its target went) is dropped rather than failing the conversion. */
function withoutForeignEnds(batch: Set<string>, outside: Set<string>) {
  return (skeleton: Stored): Stored => {
    const keep = (end?: { id: string }) => !end || batch.has(end.id) || outside.has(end.id)
    const { start, end, ...rest } = skeleton
    return { ...rest, ...(keep(start) && start ? { start } : {}), ...(keep(end) && end ? { end } : {}) }
  }
}

/** The scene rectangle on screen: what board_view calls "what the user is looking at". */
export function viewportOf(state: Pick<AppState, 'scrollX' | 'scrollY' | 'zoom' | 'width' | 'height'>): Viewport {
  const zoom = state.zoom.value
  return { x: -state.scrollX, y: -state.scrollY, width: state.width / zoom, height: state.height / zoom }
}

/** The sum of element versions, tombstones included, as the service counts it: a glance at or above the stored sum shows every saved write. */
export function sceneVersion(elements: readonly ExcalidrawElement[]): number {
  return getSceneVersion(elements)
}
