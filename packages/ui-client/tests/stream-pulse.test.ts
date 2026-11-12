/**
 * [INPUT]: stream-pulse 的判定器与假时钟
 * [OUTPUT]: 契约 S3 的三条证据：只调工具/只在思考不触发说话、有文字增量立刻触发、文字停 600ms 回落；另证换消息不误报、dispose 后静默
 * [POS]: 「说话」语义的唯一单元证据；真实会话的呈现另见 evidence 截图
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { STREAM_IDLE_MS, createStreamPulse, type PulseClock } from '../src/mastra/data/stream-pulse.ts'

class FakeClock implements PulseClock {
  now = 0
  private seq = 1
  private tasks = new Map<number, { at: number; run: () => void }>()
  set(run: () => void, ms: number) {
    const id = this.seq++
    this.tasks.set(id, { at: this.now + ms, run })
    return id
  }
  clear(id: number) { this.tasks.delete(id) }
  get pending() { return this.tasks.size }
  advance(ms: number) {
    const target = this.now + ms
    for (;;) {
      let id: number | null = null, at = Infinity
      for (const [key, task] of this.tasks) if (task.at <= target && task.at < at) { at = task.at; id = key }
      if (id === null) break
      const task = this.tasks.get(id)!
      this.tasks.delete(id)
      this.now = task.at
      task.run()
    }
    this.now = target
  }
}

function pulse() {
  const clock = new FakeClock()
  const emitted: boolean[] = []
  const instance = createStreamPulse(value => emitted.push(value), clock)
  return { clock, emitted, instance }
}

test('只调工具、只在思考：字数不动就不说话', () => {
  const { clock, emitted, instance } = pulse()
  instance.update('m1', 0)
  assert.deepEqual(emitted, [], '消息刚出现不算在说话')
  // 工具调用期间文字长度保持不变
  for (const length of [0, 0, 0]) instance.update('m1', length)
  clock.advance(5000)
  assert.deepEqual(emitted, [])
  assert.equal(clock.pending, 0, '没开过就不排计时器')
})

test('有文字增量：立刻上报说话，继续增长不重复上报也不掉回', () => {
  const { clock, emitted, instance } = pulse()
  instance.update('m1', 0)
  instance.update('m1', 12)
  assert.deepEqual(emitted, [true])
  instance.update('m1', 30)
  instance.update('m1', 31)
  assert.deepEqual(emitted, [true], '连续增长只是一次开关')
  assert.equal(clock.pending, 1, '同一时刻只留一个计时器')
  clock.advance(599)
  assert.deepEqual(emitted, [true])
  assert.equal(clock.pending, 1)
})

test('文字停下 600ms：回落（不说话），再来增量重新开口', () => {
  const { clock, emitted, instance } = pulse()
  instance.update('m1', 0)
  instance.update('m1', 12)
  clock.advance(STREAM_IDLE_MS - 1)
  assert.deepEqual(emitted, [true])
  clock.advance(1)
  assert.deepEqual(emitted, [true, false])
  assert.equal(clock.pending, 0)

  instance.update('m1', 40)
  assert.deepEqual(emitted, [true, false, true])
})

test('换消息：上一条先关闭，新消息已有文字即开口，不漏单次到达的短回复', () => {
  const { clock, emitted, instance } = pulse()
  instance.update('m1', 0)
  instance.update('m1', 12)
  instance.update('m2', 6)
  assert.deepEqual(emitted, [true, false, true])
  assert.equal(clock.pending, 1, '只留下新消息的回落计时器')
  instance.update('m2', 20)
  assert.deepEqual(emitted, [true, false, true])
})

test('恢复会话：已有正文只建立基线；新增长才开口', () => {
  const { clock, emitted, instance } = pulse()
  instance.update('restored', 120)
  assert.deepEqual(emitted, [])
  assert.equal(clock.pending, 0)
  instance.update('restored', 125)
  assert.deepEqual(emitted, [true])
})

test('助手消息消失：立刻回落，且不留计时器', () => {
  const { clock, emitted, instance } = pulse()
  instance.update('m1', 0)
  instance.update('m1', 12)
  instance.update(null, 0)
  assert.deepEqual(emitted, [true, false])
  assert.equal(clock.pending, 0)
})

test('dispose：关掉并静默，之后的计时器不再回调', () => {
  const { clock, emitted, instance } = pulse()
  instance.update('m1', 0)
  instance.update('m1', 12)
  instance.dispose()
  assert.deepEqual(emitted, [true, false])
  assert.equal(clock.pending, 0)
  clock.advance(5000)
  instance.update('m1', 99)
  assert.deepEqual(emitted, [true, false], 'dispose 后不再上报')
})
