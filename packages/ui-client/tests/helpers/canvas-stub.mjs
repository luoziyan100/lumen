/**
 * [INPUT]: Node module hooks; React from the suite's own node_modules
 * [OUTPUT]: a load hook that serves studio/BoardCanvas.tsx as a stand-in: one `.board-canvas` div carrying the sheet, read-only state, element ids and the
 *           focused element in data attributes, reporting blank like the real canvas; `globalThis.__canvasStubFails = message` makes it throw (a canvas that cannot open)
 * [POS]: for component suites that render Board in jsdom, where Excalidraw has no 2D canvas to paint on. Only the drawing surface is replaced; Board,
 *        useBoard, the client and the service stay real. The canvas's own sync is tested with the real library in board-canvas-sync.test.ts
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
const STUB = `
import { createElement, useEffect } from 'react'
export default function BoardCanvas({ scene, readOnly, focus, onBlank }) {
  if (globalThis.__canvasStubFails) throw new Error(globalThis.__canvasStubFails)
  const live = scene.elements.filter(element => !element.isDeleted)
  useEffect(() => { onBlank(live.length === 0) }, [scene])
  return createElement('div', { className: 'board-canvas', 'data-sheet': scene.sheet.id, 'data-readonly': String(readOnly),
    'data-elements': live.map(element => element.id).join(' '), 'data-ops': scene.ops.map(op => op.id).join(' '), 'data-focus': focus ? focus.elementId : '' })
}`

export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/mastra/studio/BoardCanvas.tsx')) return { format: 'module', source: STUB, shortCircuit: true }
  return nextLoad(url, context)
}
