/**
 * [INPUT]: @excalidraw/excalidraw (Excalidraw, MainMenu, Fonts, exportScene, restoreElements, CaptureUpdateAction) and its stylesheet; canvas-sync's Ledger,
 *          mergeRemote, layOutOp, viewportOf and sceneVersion; LumenApi's canvas routes; draft.ts's beforeSend; useLocale; the color-scheme on <html>
 * [OUTPUT]: BoardCanvas (default export, loaded with React.lazy by Board): one sheet's co-drawn Excalidraw canvas
 * [POS]: the drawing surface of studio/Board, mounted once per sheet (Board keys it by sheet id). Board owns tabs, notices and the erase banner;
 *        this file owns the editor and its sync: the first scene seeds it, later scenes merge in by reconcile; the user's changed elements save after
 *        600ms; AI ops are laid out with the page's real fonts, committed, and only then enter the scene (outside undo); the viewport saves after 600ms;
 *        a glance (PNG) goes up after AI writes and before a send, only while the canvas is on screen. A folded sheet is view mode and saves nothing.
 *        Fonts come from the app's own origin (`excalidraw/` beside index.html; Board sets EXCALIDRAW_ASSET_PATH before this chunk loads).
 *        Hidden chrome: the library (toolbar button and sidebar trigger), Help and the sticky-note tool have no prop to turn them off in this snapshot,
 *        and the sticky note has no Chinese strings, so studio.css hides exactly those three controls under `.board-canvas`
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Excalidraw, MainMenu, CaptureUpdateAction, Fonts, exportScene, restoreElements } from '@excalidraw/excalidraw'
import type { ExcalidrawElement, OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import { useLocale } from '../../i18n/index.ts'
import type { CanvasElement, CanvasFile, CanvasOp, CanvasScene, LumenApi } from '../data/client.ts'
import { beforeSend } from '../views/conversation/draft.ts'
import { Ledger, layOutOp, mergeRemote, sceneVersion, viewportOf } from './canvas-sync.ts'

// Lumen's locale ids to Excalidraw's language codes
const LANG = { zh: 'zh-CN', en: 'en' } as const
const SAVE_MS = 600, VIEWPORT_MS = 600, GLANCE_MS = 800
// The service takes at most this many elements and files in one save (CANVAS_LIMITS); the glance's longest side suits vision models
const SAVE_BATCH = 2000, FILE_BATCH = 8, GLANCE_SIDE = 1568

export interface CanvasProps {
  api: LumenApi
  /** The sheet's latest scene from useBoard; a new object on every changed read */
  scene: CanvasScene
  /** A folded sheet: view mode, nothing saved */
  readOnly: boolean
  /** A conversation card's element on this sheet: bring it into view and select it */
  focus: { elementId: string; nonce: number } | null
  /** Ask for a fresh scene (after a commit the read has not seen yet) */
  onSettled: () => void
  onError: (message: string) => void
  /** Whether the sheet has no live element, reported as it changes (the easel stands on a blank sheet) */
  onBlank: (blank: boolean) => void
}

/** The <html> color-scheme the appearance pipeline writes, followed live */
function useScheme(): 'light' | 'dark' {
  const read = (): 'light' | 'dark' => (document.documentElement.style.colorScheme === 'dark' ? 'dark' : 'light')
  const [scheme, setScheme] = useState(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setScheme(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [])
  return scheme
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const opCode = (error: unknown) => (error as { detail?: { code?: unknown } } | null)?.detail?.code

function dataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export default function BoardCanvas({ api, scene, readOnly, focus, onSettled, onError, onBlank }: CanvasProps) {
  const locale = useLocale()
  const theme = useScheme()
  const [editor, setEditor] = useState<ExcalidrawImperativeAPI | null>(null)
  const sheetId = scene.sheet.id
  const ledger = useRef(new Ledger()), sentFiles = useRef(new Set<string>()), working = useRef(new Set<string>())
  const timers = useRef<Record<'save' | 'viewport' | 'glance', number | undefined>>({ save: undefined, viewport: undefined, glance: undefined })
  const saving = useRef<Promise<void> | null>(null), glanced = useRef(-1), host = useRef<HTMLDivElement>(null)
  const props = useRef({ readOnly, onSettled, onError, onBlank }), blank = useRef<boolean | null>(null)
  props.current = { readOnly, onSettled, onError, onBlank }

  // ---- The first scene seeds the editor; the service already has every element in it ----
  const initialData = useMemo(() => {
    ledger.current.remember(scene.elements)
    for (const element of scene.elements) if (element.type === 'image' && typeof element.fileId === 'string') sentFiles.current.add(element.fileId)
    return { elements: restoreElements(scene.elements as unknown as ExcalidrawElement[], null, { repairBindings: true }), appState: { showHints: false } }
  }, [])

  // ---- Save: only what the service has not seen, one request at a time; a change during the request saves on the next round ----
  function save(): Promise<void> {
    if (!editor || props.current.readOnly) return Promise.resolve()
    if (saving.current) return saving.current.then(save)
    const elements = ledger.current.unsent(editor.getSceneElementsIncludingDeleted())
    if (!elements.length) return Promise.resolve()
    const run = (async () => {
      for (let start = 0; start < elements.length; start += SAVE_BATCH) {
        const batch = elements.slice(start, start + SAVE_BATCH)
        const result = await api.saveCanvas(sheetId, batch, newFiles(batch))
        ledger.current.remember(batch)
        if (result.kept.length) {
          // The service kept its own copy over ours (same version, or ours was older): show its copy
          editor.updateScene({ elements: mergeRemote(editor.getSceneElementsIncludingDeleted(), [], editor.getAppState(), result.kept), captureUpdate: CaptureUpdateAction.NEVER })
          ledger.current.remember(result.kept)
        }
      }
    })().catch(error => props.current.onError(message(error))).finally(() => { saving.current = null })
    saving.current = run
    return run
  }
  /** Images new to the service, at most a request's worth; the rest go with a later save */
  function newFiles(elements: readonly ExcalidrawElement[]): CanvasFile[] {
    const files = editor!.getFiles(), out: CanvasFile[] = []
    for (const element of elements) {
      if (element.type !== 'image' || !element.fileId || sentFiles.current.has(element.fileId) || out.length >= FILE_BATCH) continue
      const file = files[element.fileId]
      if (!file) continue
      out.push({ id: file.id, mimeType: file.mimeType, dataURL: file.dataURL })
      sentFiles.current.add(file.id)
    }
    return out
  }
  function schedule(kind: 'save' | 'viewport' | 'glance', work: () => void, ms: number) {
    window.clearTimeout(timers.current[kind])
    timers.current[kind] = window.setTimeout(work, ms)
  }

  // ---- Glance (Q6): the whole scene as one PNG, only while this canvas is on screen; skipped when nothing changed since the last one ----
  async function glance(): Promise<void> {
    if (!editor || document.hidden || !host.current?.offsetWidth) return
    const all = editor.getSceneElementsIncludingDeleted(), version = sceneVersion(all)
    if (version === glanced.current) return
    // Excalidraw ships two copies of its element types; the export's NonDeleted type is the other copy
    const visible = all.filter(element => !element.isDeleted) as unknown as Parameters<typeof exportScene>[0]['data']['elements']
    if (!visible.length) return
    const blob = await exportScene({ type: 'png', data: { elements: visible, files: editor.getFiles() }, config: { maxWidthOrHeight: GLANCE_SIDE, padding: 24, theme: 'light' } })
    await api.saveGlance(sheetId, version, await dataURL(blob))
    glanced.current = version
  }

  // ---- Images the scene uses but the editor lacks come from the service once ----
  async function loadFiles(elements: readonly CanvasElement[]) {
    if (!editor) return
    const have = editor.getFiles(), missing = [...new Set(elements.filter(element => element.type === 'image' && typeof element.fileId === 'string' && !have[element.fileId as string]).map(element => element.fileId as string))]
    if (!missing.length) return
    const files = await Promise.all(missing.map(id => api.canvasFile(sheetId, id).catch(() => null)))
    const loaded = files.filter((file): file is CanvasFile => !!file)
    for (const file of loaded) sentFiles.current.add(file.id)
    if (loaded.length) editor.addFiles(loaded.map(file => ({ id: file.id, mimeType: file.mimeType, dataURL: file.dataURL, created: Date.now() }) as unknown as BinaryFileData))
  }

  // ---- One AI op: measure with real fonts, commit, then show it. Showing it first would let the user's next save claim the AI's strokes ----
  async function lay(op: CanvasOp) {
    if (!editor) return
    const images = op.kind === 'draw' ? (op.skeletons as CanvasElement[]).filter(skeleton => skeleton.type === 'image') : []
    await loadFiles(images)
    const draft = layOutOp(op, editor.getSceneElementsIncludingDeleted())
    await Fonts.loadElementsFonts(draft)
    const laid = layOutOp(op, editor.getSceneElementsIncludingDeleted()).map(element => ({ ...element, customData: { ...element.customData, author: 'ai' } }))
    try { await api.commitOp(sheetId, op.id, laid) }
    catch (error) {
      // Another window committed it first: its elements arrive with the next read
      if (opCode(error) !== 'board.op_done') throw error
      props.current.onSettled()
      return
    }
    editor.updateScene({ elements: mergeRemote(editor.getSceneElementsIncludingDeleted(), laid as unknown as CanvasElement[], editor.getAppState()), captureUpdate: CaptureUpdateAction.NEVER })
    ledger.current.remember(laid)
    props.current.onSettled()
  }

  // ---- Each later scene: merge the service's elements, then lay out the ops nobody has committed ----
  const seeded = useRef(false)
  useEffect(() => {
    if (!editor) return
    const first = !seeded.current
    seeded.current = true
    let wrote = false
    if (!first) {
      const local = editor.getSceneElementsIncludingDeleted()
      const known = new Map(local.map(element => [element.id, element.version]))
      wrote = scene.elements.some(element => (known.get(element.id) ?? -1) < element.version)
      if (wrote) editor.updateScene({ elements: mergeRemote(local, scene.elements, editor.getAppState()), captureUpdate: CaptureUpdateAction.NEVER })
      ledger.current.remember(scene.elements)
    }
    void loadFiles(scene.elements)
    const pending = props.current.readOnly ? [] : scene.ops.filter(op => !working.current.has(op.id))
    for (const op of pending) working.current.add(op.id)
    void (async () => {
      for (const op of pending) {
        try { await lay(op) } catch (error) { props.current.onError(message(error)) }
        finally { working.current.delete(op.id) }
      }
      if (wrote || pending.length) schedule('glance', () => void glance().catch(() => {}), GLANCE_MS)
    })()
  }, [editor, scene])

  // ---- The stored viewport opens where the user left the sheet ----
  useEffect(() => {
    if (editor && scene.viewport) editor.setViewport({ target: scene.viewport, fit: 'contain' })
  }, [editor])

  // ---- Before a message goes out, the model's picture catches up with what the user drew ----
  useEffect(() => {
    if (!editor) return
    const hook = () => glance().catch(() => {})
    beforeSend.add(hook)
    return () => { beforeSend.delete(hook) }
  }, [editor])

  // ---- A conversation card's element: into view and selected ----
  useEffect(() => {
    if (!editor || !focus) return
    const target = editor.getSceneElements().find(element => element.id === focus.elementId)
    if (!target) return
    editor.setViewport({ target, fit: 'scale-down', animation: true })
    editor.selection.select([target.id], { captureUpdate: CaptureUpdateAction.NEVER })
  }, [editor, focus?.nonce])

  // ---- Leaving the sheet: what is still waiting saves now ----
  useEffect(() => () => {
    for (const timer of Object.values(timers.current)) window.clearTimeout(timer)
    void save()
  }, [editor])

  return (
    <div className="board-canvas" ref={host}>
      <Excalidraw
        langCode={LANG[locale as keyof typeof LANG] ?? 'en'}
        theme={theme}
        onExcalidrawAPI={(api: ExcalidrawImperativeAPI | null) => setEditor(api)}
        initialData={initialData}
        viewModeEnabled={readOnly}
        onChange={(elements: readonly OrderedExcalidrawElement[], _state: AppState, _files: BinaryFiles) => {
          const empty = !elements.some(element => !element.isDeleted)
          if (empty !== blank.current) { blank.current = empty; props.current.onBlank(empty) }
          if (!readOnly) schedule('save', () => void save(), SAVE_MS)
        }}
        onScrollChange={() => schedule('viewport', () => {
          if (editor) void api.saveViewport(sheetId, viewportOf(editor.getAppState())).catch(() => {})
        }, VIEWPORT_MS)}
        UIOptions={{
          canvasActions: { changeViewBackgroundColor: false, clearCanvas: false, export: false, loadScene: false, saveToActiveFile: false, saveAsImage: false, toggleTheme: false },
          tools: { image: true },
        }}
        ui={{ disabled: { minimap: true } }}
        aiEnabled={false}
      >
        <MainMenu><MainMenu.DefaultItems.SearchMenu /></MainMenu>
      </Excalidraw>
    </div>
  )
}
