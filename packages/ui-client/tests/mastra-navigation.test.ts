/**
 * [INPUT]: 真实 HTTP 分页接口、Mastra 客户端和 React 侧栏
 * [OUTPUT]: 跨项目完整聚合、折叠持久化、预览/档案分页、右键菜单与快捷搜索选择回归
 * [POS]: 导航恢复的交互证据，临时服务器不接触正式研究数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { register } from 'node:module'
import { createElement, act } from 'react'
import { JSDOM } from 'jsdom'
import { LumenApi, type SessionInfo } from '../src/mastra/data/client.ts'
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'NodeFilter', 'localStorage', 'DocumentFragment', 'MutationObserver', 'HTMLInputElement', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name as keyof typeof dom.window] })
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } })
register('./helpers/tsx-loader.mjs', import.meta.url)
const { createRoot } = await import('react-dom/client')
const { Sidebar } = await import('../src/mastra/views/chrome/Sidebar.tsx')
const { SearchModal } = await import('../src/mastra/views/chrome/SearchModal.tsx')
const { SessionsIndex } = await import('../src/mastra/views/chrome/SessionsIndex.tsx')
const { loadCatalog } = await import('../src/mastra/views/chrome/catalog.ts')
const projects = ['a', 'b'].map(id => ({ id, name: `项目${id}`, archived: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' }))
const sessions: SessionInfo[] = Array.from({ length: 125 }, (_, i) => ({ projectId: i < 110 ? 'a' : 'b', taskId: `s${i}`, resourceId: 'r', threadId: `t${i}`, title: `对话${i}`, running: i === 1, waiting: i === 2, pinned: i === 124, archived: false, createdAt: '2026-01-01', updatedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), lastMessageId: null, unread: false }))
test('跨项目分页完整加载，导航保持四条预览、最近二十条、全局置顶与持久折叠', async () => {
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer navigation-test')
    const url = new URL(req.url!, 'http://localhost'), page = Number(url.searchParams.get('page'))
    const projectId = url.pathname.split('/')[3]
    const all = url.pathname === '/lumen/projects' ? projects : sessions.filter(item => item.projectId === projectId)
    const perPage = Number(url.searchParams.get('perPage'))
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ items: all.slice(page * perPage, (page + 1) * perPage), page, perPage, total: all.length, hasMore: (page + 1) * perPage < all.length }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const element = document.createElement('div'); document.body.append(element)
  let root = createRoot(element)
  try {
    const catalog = await loadCatalog(new LumenApi({ baseUrl: `http://127.0.0.1:${address.port}`, token: 'navigation-test' }), false, false)
    assert.equal(catalog.sessions.length, 125); assert.equal(catalog.sessions[0].projectId, 'b')
    let updated: SessionInfo | undefined, renamedProject: string | undefined
    let selected: SessionInfo | undefined, indexed: string | null | undefined
    const props = { ...catalog, projectId: 'a', identity: null, busy: false, archivedProjects: false, archivedSessions: false, toggleProjects() {}, toggleSessions() {}, onProject() {}, onSession(item: SessionInfo) { selected = item }, onIndex(id: string | null) { indexed = id }, onSearch() {}, onRenameSession() {}, onUpdateSession(item: SessionInfo) { updated = item }, onCopySession() {}, onToggleUnread(item: SessionInfo) { updated = item }, onNew() {}, onCreateProject() {}, onRenameProject(item: {id: string}) { renamedProject = item.id }, onArchiveProject() {}, onSettings() {}, onAgents() {} }
    await act(async () => root.render(createElement(Sidebar, props)))
    assert.equal(element.querySelectorAll('.sb-sess-wrap.is-open .sb-item').length, 4)
    assert.equal(element.querySelectorAll('nav[aria-label="最近会话"] .sb-item').length, 20)
    assert.equal(element.querySelectorAll('nav[aria-label="置顶会话"] .sb-item').length, 1)
    assert.match(element.querySelector('aside')!.getAttribute('style')!, /300px/)
    await act(async () => (element.querySelector('nav[aria-label="置顶会话"] .sb-item') as HTMLButtonElement).click())
    assert.equal(selected?.projectId, 'b')
    await act(async () => (element.querySelector('nav[aria-label="置顶会话"] .sb-item') as HTMLButtonElement).dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    const markUnread = [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === '标为未读')
    assert.ok(markUnread)
    await act(async () => markUnread.click()); assert.equal(updated?.projectId, 'b')
    await act(async () => (element.querySelector('nav[aria-label="置顶会话"] .sb-item') as HTMLButtonElement).dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    const unpin = [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === '取消置顶')
    assert.ok(unpin)
    await act(async () => unpin.click()); assert.equal(updated?.projectId, 'b')
    await act(async () => (element.querySelector('.sb-folder-main') as HTMLButtonElement).dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    const rename = [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === '重命名项目')
    assert.ok(rename)
    await act(async () => rename.click()); assert.equal(renamedProject, 'a')
    await act(async () => (element.querySelector('.sb-sess-more') as HTMLButtonElement).click()); assert.equal(indexed, 'a')
    const projectBody = element.querySelector('#sb-projects-body')!, childBody = element.querySelector('#sb-sessions-a')!
    const firstSession = childBody.querySelector('.sb-item')!
    await act(async () => (element.querySelector('.sb-folder-ic') as HTMLButtonElement).click())
    assert.equal(childBody.getAttribute('aria-hidden'), 'true'); assert.ok(childBody.hasAttribute('inert'))
    assert.equal(childBody.querySelector('.sb-item'), firstSession, '子会话保持挂载，收帘完成前不消失')
    await act(async () => (element.querySelector('.sb-folder-ic') as HTMLButtonElement).click())
    assert.equal(childBody.getAttribute('aria-hidden'), 'false'); assert.equal(childBody.hasAttribute('inert'), false)
    await act(async () => (element.querySelector('.sb-section-toggle') as HTMLButtonElement).click())
    assert.equal(localStorage.getItem('lumen:sbProjectsOpen'), '0')
    assert.equal(element.querySelector('#sb-projects-body'), projectBody, '项目区不能通过卸载跳过退出动画')
    assert.equal(projectBody.getAttribute('aria-hidden'), 'true'); assert.ok(projectBody.hasAttribute('inert'))
    assert.equal(projectBody.querySelector('.sb-item'), firstSession)
    await act(async () => root.unmount()); root = createRoot(element)
    await act(async () => root.render(createElement(Sidebar, props)))
    assert.equal(element.querySelector('.sb-section-toggle')!.getAttribute('aria-expanded'), 'false')
    await act(async () => root.render(createElement(SessionsIndex, { projects: catalog.projects, sessions: catalog.sessions, initialProject: 'a', onSession: props.onSession })))
    assert.equal(element.querySelectorAll('.sessions-row').length, 20)
    assert.match(element.querySelector('.sessions-pager-status')!.textContent!, /110 条/)
    await act(async () => [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === '下一页')!.click())
    assert.match(element.querySelector('.sessions-pager-status')!.textContent!, /2 \/ 6/)
    await act(async () => (element.querySelector('.sessions-row') as HTMLButtonElement).click())
    assert.equal(selected?.projectId, 'a')
    await act(async () => [...element.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === '进行中')!.click())
    assert.equal(element.querySelectorAll('.sessions-row').length, 2)
    assert.match(element.querySelector('.sessions-list')!.textContent!, /等待处理/)
    await act(async () => root.render(createElement(SearchModal, { open: true, onOpenChange() {}, conversations: catalog.sessions, onSelect: props.onSession })))
    const result = [...document.querySelectorAll<HTMLElement>('[role=option]')].find(item => item.textContent?.includes('对话124'))
    assert.ok(result)
    await act(async () => result.click()); assert.equal(selected?.projectId, 'b')
  } finally { await act(async () => root.unmount()); element.remove(); localStorage.clear(); await new Promise<void>(resolve => server.close(() => resolve())) }
})

test('已发自动已读先完成，随后手动未读不会被迟到响应覆盖', async () => {
  const order: string[] = []
  let release!: () => void, entered!: () => void
  const held = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
  const server = createServer(async (req, res) => {
    const action = req.url!.split('/').at(-1)!
    order.push(action)
    if (action === 'read') { entered(); await held }
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ changed: true }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const api = new LumenApi({ baseUrl: `http://127.0.0.1:${address.port}`, token: 'navigation-test' })
  try {
    const read = api.markSessionRead({ projectId: 'a', taskId: 's' }, 'latest')
    await started
    const unread = api.setSessionUnread({ projectId: 'a', taskId: 's' }, true)
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.deepEqual(order, ['read'])
    release(); await Promise.all([read, unread]); assert.deepEqual(order, ['read', 'unread'])
  } finally { release(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
