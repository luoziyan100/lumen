/**
 * [INPUT]: Swift 原生驱动、显式开发应用与独立数据根、真实受控服务
 * [OUTPUT]: CGWindow 几何与实际点击/拖动/菜单/键盘的严格断言；隐藏主窗的单订阅四态投影证据
 * [POS]: 开发构建验收入口；无产品测试后门，不触及正式服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { auditNaming } from './naming.mjs'
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, openSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { LumenApi } from '../../src/mastra/data/client.ts'
const [bundle, root, out] = process.argv.slice(2)
assert.ok(root?.startsWith('/tmp/lumen-sprite-'))
mkdirSync(out, { recursive: true })
const log = `${out}/native-projection.jsonl`
writeFileSync(log, '')
let child, pid, results = []
function check(name, value, detail = '') {
  const row = `${value ? 'PASS' : 'FAIL'} ${name} ${detail}`
  results.push(row); console.log(row)
  assert.ok(value, row)
}
const native = (action, ...args) => { const result = JSON.parse(execFileSync('/tmp/lumen-sprite-native', [action, String(pid), ...args.map(String)], { encoding: 'utf8' })); if ('result' in result) assert.equal(result.result, 0, `${action} ${args}`); return result }
const live = () => { try { process.kill(pid, 0); return true } catch { return false } }
async function until(condition, description, timeout = 10000) {
  const end = Date.now() + timeout
  while (!await condition()) { if (Date.now() > end) throw new Error(description); await delay(150) }
}
const list = () => native('windows').filter(w => w.visible && w.alpha > .9)
const desktop = () => list().find(w => w.bounds.Width === 156 && w.bounds.Height === 238)
const main = () => list().find(w => w.bounds.Width > 500 && w.bounds.Height > 400)
const center = () => { const b = desktop().bounds; return [b.X + b.Width / 2, b.Y + b.Height / 2] }
const reopen = async () => { execFileSync('open', ['-a', bundle]); await until(() => main() && !desktop(), 'main did not reopen'); await delay(500) }
const closeMain = async () => { native('close'); await delay(650) }
async function launch() {
  child = spawn(`${bundle}/Contents/MacOS/Lumen`, ['--mastra-data-root', root], { env: { ...process.env, LUMEN_SPRITE_TRACE: log }, stdio: ['ignore', openSync(`${out}/native-app.log`, 'a'), openSync(`${out}/native-app.log`, 'a')] })
  pid = child.pid
  await until(() => main(), 'main did not launch'); await delay(2500)
}
const quit = async () => { native('key', 'q'); await until(() => !live(), 'cmd-q did not terminate') }
async function menu(index) {
  native('right', ...center()); await delay(300)
  const window = list().find(w => w.layer >= 100 && w.bounds.Height > 60 && w.bounds.Height < 150)
  assert.ok(window, 'native menu missing')
  const b = window.bounds
  native('click', b.X + b.Width / 2, b.Y + 8 + (b.Height - 16) / 3 * (index + .5))
  await delay(500)
}
async function toggle() {
  native('press', '设置'); await delay(250)
  native('press', '外观'); await delay(250)
  native('press', '收起窗口时在桌面显示精灵'); await delay(200)
  native('press', '关闭设置'); await delay(200)
}
try {
  check('N0 源码及构建产物命名', auditNaming().length === 0)
  const saved = `${root}/desktop-ui/sprite-position.json`
  if (existsSync(saved)) unlinkSync(saved)
  await launch()
  check('P1 主窗可见时桌面形态不在屏上', !!main() && !desktop())
  execFileSync('osascript', ['-e', 'tell application "Finder" to activate'])
  await until(() => native('front').pid !== pid, '前台切换未生效，无法验证失焦与不抢焦点')
  check('P1 失焦不切换', !!main() && !desktop())
  const foreground = native('front').pid
  await closeMain()
  check('P1/P6 关窗保留进程，只有桌面形态', live() && !!desktop() && !main())
  check('P2 出现时不抢焦点', native('front').pid === foreground)
  const area = native('screen'), first = desktop()
  check('P2 156×238窗口位于置顶层', first.layer > 0)
  check('P2 默认工作区右下离边24px', Math.abs(first.bounds.X - (area.x + area.w - 156 - 24)) <= 1 && Math.abs(first.bounds.Y - (area.y + area.h - 238 - 24)) <= 1, JSON.stringify(first.bounds))
  let [x, y] = center()
  native('drag', x, y, x - 180, y - 90); await delay(500)
  const moved = desktop()?.bounds
  check('P3 合成拖动实际移动且未打开', !!moved && !main() && Math.abs(moved.X - first.bounds.X) > 100)
  // 原生拖动的最后一批 Moved 可能晚于鼠标释放；等几何与落盘位置连续稳定后再重启。
  let stable = 0, previous = ''
  await until(() => {
    const bounds = desktop()?.bounds, savedPosition = JSON.parse(readFileSync(saved, 'utf8'))
    const current = JSON.stringify(bounds)
    stable = bounds && savedPosition.x === bounds.X && savedPosition.y === bounds.Y && current === previous ? stable + 1 : 0
    previous = current
    return stable >= 3
  }, '拖动结束后几何与位置文件未稳定')
  const remembered = { ...desktop().bounds }
  await quit()
  check('P6 ⌘Q 后窗口和进程全部退出', !live() && !list().length)
  await launch(); await closeMain()
  const restored = desktop().bounds
  const expected = { X: Math.max(area.x, Math.min(remembered.X, area.x + area.w - 156)), Y: Math.max(area.y, Math.min(remembered.Y, area.y + area.h - 238)) }
  check('P3 重启后记忆位置，越界按工作区夹取', restored.X === expected.X && restored.Y === expected.Y, JSON.stringify({remembered, expected, restored}))
  ;[x, y] = center()
  native('drag', x, y, x + 2, y + 1); await until(() => main() && !desktop(), 'jitter click did not open')
  check('P3/P4 2px/1px抖动视为点击并唤回', !!main() && native('front').pid === pid)
  await until(() => native('tree').some(r => r.label.includes('收回成球')), 'conversation did not expand')
  check('P4 点击后展开既有对话', true)
  native('minimize'); await delay(700)
  check('P1 最小化后只有桌面形态', !!desktop() && !main())
  native('restore'); await delay(700)
  check('P1 取消最小化后只有主窗', !!main() && !desktop())
  native('key', 'h'); await delay(650)
  check('Q2 ⌘H 连同桌面形态一起隐藏', !main() && !desktop())
  await reopen()
  await toggle(); await closeMain()
  check('P5 关闭偏好后收起不浮出', !main() && !desktop() && live())
  await reopen(); await toggle(); await closeMain()
  check('P5 重新启用后浮出', !!desktop())
  await menu(1)
  check('P5 本次隐藏不退出进程', !desktop() && live())
  await reopen(); await closeMain()
  check('P5 本次隐藏只影响一次', !!desktop())
  await menu(0)
  check('P5 菜单打开唤回主窗', !!main() && !desktop())

  // --- P7：真正的 Controller/Memory/SSE；只替换模型网络 ---
  const connection = JSON.parse(readFileSync(`${root}/mastra-service.json`, 'utf8'))
  const api = new LumenApi(connection)
  const topic = await api.createTopic(`状态投影验证 ${Date.now()}`)
  await delay(3500)
  native('press', topic.title); await delay(700)
  const identity = { topicId: topic.id, taskId: 'sprite-live' }
  await api.open(identity)
  const fixture = async (body) => {
    const response = await fetch(`${connection.baseUrl}/fixture`, { headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) })
    assert.ok(response.ok, `fixture ${response.status}`); return response.json()
  }
  const before = await fixture(), begin = Date.now()
  await closeMain()
  await api.session(identity).sendMessage('请逐段回答，用于验证状态投影。')
  await until(async () => (await fixture()).streaming, 'model stream not opened')
  const projections = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.at >= begin)
  const projected = state => projections().some(row => row.kind === 'projected' && row.window === 'main' && row.state === state)
  await until(() => projected('running'), 'hidden main did not project running')
  await fixture({ content: '主窗口隐藏后仍收到文字。' })
  await until(() => projected('speaking'), 'hidden main did not project speaking')
  await delay(900)
  await fixture({ ask: true, finish: true })
  await until(() => projected('waiting'), 'hidden main did not project waiting')
  await api.stop(identity)
  await until(() => projected('idle'), 'hidden main did not project idle')
  const after = await fixture(), rows = projections()
  const sent = rows.filter(r => r.kind === 'projected' && r.window === 'main')
  const rendered = rows.filter(r => r.kind === 'rendered' && r.window === 'sprite-desktop')
  const paired = sent.map((row, index) => ({ state: row.state, sourceAt: row.at, renderedAt: rendered[index]?.at }))
  check('P7 桌面真实DOM提交序列与主窗状态序列一致', JSON.stringify(sent.map(r => r.state)) === JSON.stringify(rendered.map(r => r.state)))
  const path = `/api/agent-controller/lumen/sessions/${encodeURIComponent(`${topic.id}:${identity.taskId}`)}/stream`
  const subscriptions = (after.streams[path] ?? 0) - (before.streams[path] ?? 0)
  check('P7 隐藏期间仅增加一条会话订阅', subscriptions === 1, `${subscriptions}`)
  check('P7 主窗与桌面序列完全一致，逐项延迟≤1s', paired.every(p => p.renderedAt !== undefined && p.renderedAt - p.sourceAt >= 0 && p.renderedAt - p.sourceAt <= 1000), JSON.stringify(paired))
  check('P7 四态均来自真实订阅', ['idle', 'running', 'waiting', 'speaking'].every(state => paired.some(p => p.state === state)))
  check('P7 全程主窗仍隐藏，桌面形态可见', !main() && !!desktop())
  writeFileSync(`${out}/p7.json`, JSON.stringify({ subscriptions, paired, measurement: '调试构建记录主窗状态进入原生转发与桌面React DOM提交；不等同屏幕像素绘制时间' }, null, 2))
  await menu(2); await until(() => !live(), 'menu quit did not terminate')
  check('P6 原生菜单退出后两个窗口和进程消失', !live() && !list().length)
  writeFileSync(`${out}/native-results.log`, results.join('\n') + '\n')
} finally {
  if (pid && live()) process.kill(pid, 'SIGTERM')
  writeFileSync(`${out}/native-results.log`, results.join('\n') + '\n')
}
