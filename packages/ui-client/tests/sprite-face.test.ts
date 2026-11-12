/**
 * [INPUT]: sprite-face 的状态映射、FaceDriver 与假时钟（不挂 React、不碰 DOM）
 * [OUTPUT]: 表情节奏证据：状态→表情映射（空闲/运行/等你/说话）、眨眼 4–7s 且持续 120ms、说话 180–260ms 交替、reduced-motion 不排计时器、卸载后回调不再触发
 * [POS]: S3/S5/S6 的单元证据；视觉与截图另见 evidence
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { FaceDriver, faceFor, spriteState, BLINK_MS, BLINK_MAX_MS, BLINK_MIN_MS, TALK_MAX_MS, TALK_MIN_MS, type FaceClock, type SpriteFaceName } from '../src/mastra/studio/sprite-face.ts'

class FakeClock implements FaceClock {
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
  get nextDelay() { return Math.min(...[...this.tasks.values()].map(task => task.at)) - this.now }
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

function driver(state: Parameters<typeof faceFor>[0], options: { random?: () => number; reduced?: boolean } = {}) {
  const clock = new FakeClock()
  const faces: SpriteFaceName[] = []
  const instance = new FaceDriver(face => faces.push(face), state, clock, options.random ?? (() => 0), options.reduced ?? false)
  return { clock, faces, instance }
}

test('状态映射：空闲 neutral、运行 thinking、等你 warm、说话 speaking', () => {
  assert.equal(faceFor('idle'), 'neutral')
  assert.equal(faceFor('running'), 'thinking')
  assert.equal(faceFor('waiting'), 'warm')
  assert.equal(faceFor('speaking'), 'speaking')
})

test('会话信号：说话压过运行；文字停了回到运行；等你压过运行', () => {
  assert.equal(spriteState({ running: true, waiting: false, streaming: true }), 'speaking')
  assert.equal(spriteState({ running: true, waiting: false, streaming: false }), 'running')
  assert.equal(spriteState({ running: true, waiting: true }), 'waiting')
  assert.equal(spriteState({ running: false, waiting: false }), 'idle')
})

test('空闲：眨眼间隔 4–7 秒，blink 持续 120ms 后回到 neutral，并继续排下一次', () => {
  const fast = driver('idle', { random: () => 0 })
  assert.equal(fast.instance.current, 'neutral')
  assert.equal(fast.clock.pending, 1)
  assert.equal(fast.clock.nextDelay, BLINK_MIN_MS)

  fast.clock.advance(BLINK_MIN_MS - 1)
  assert.deepEqual(fast.faces, [])
  fast.clock.advance(1)
  assert.deepEqual(fast.faces, ['blink'])

  fast.clock.advance(BLINK_MS - 1)
  assert.deepEqual(fast.faces, ['blink'])
  fast.clock.advance(1)
  assert.deepEqual(fast.faces, ['blink', 'neutral'])
  assert.equal(fast.clock.pending, 1, '眨完还要排下一次')
  assert.ok(fast.clock.nextDelay >= BLINK_MIN_MS && fast.clock.nextDelay <= BLINK_MAX_MS)

  const slow = driver('idle', { random: () => 0.999 })
  assert.ok(slow.clock.nextDelay <= BLINK_MAX_MS)
  assert.ok(slow.clock.nextDelay >= BLINK_MIN_MS)
  assert.ok(slow.clock.nextDelay > BLINK_MIN_MS + 1000, '随机落在区间里，不是写死')
})

test('说话：speaking 与 neutral 每 180–260ms 交替', () => {
  const { clock, faces } = driver('speaking', { random: () => 0 })
  assert.equal(clock.nextDelay, TALK_MIN_MS)
  clock.advance(TALK_MIN_MS)
  assert.deepEqual(faces, ['neutral'])
  assert.equal(clock.nextDelay, TALK_MIN_MS)
  clock.advance(TALK_MIN_MS)
  assert.deepEqual(faces, ['neutral', 'speaking'])

  const slow = driver('speaking', { random: () => 1 })
  assert.ok(slow.clock.nextDelay >= TALK_MIN_MS && slow.clock.nextDelay <= TALK_MAX_MS)
})

test('状态切换：运行/等你立刻换表情，并清掉空闲的眨眼计时器', () => {
  const { clock, faces, instance } = driver('idle', { random: () => 0 })
  clock.advance(1000)
  instance.setState('waiting')
  assert.equal(instance.current, 'warm')
  assert.equal(clock.pending, 0, '等你态不该留计时器')
  clock.advance(10000)
  assert.deepEqual(faces, ['warm'])

  instance.setState('running')
  assert.equal(instance.current, 'thinking')
  assert.equal(clock.pending, 0)

  instance.setState('idle')
  assert.equal(instance.current, 'neutral')
  assert.equal(clock.pending, 1, '回到空闲重新开始眨眼')
})

test('reduced-motion：不排任何计时器，只按状态给静态表情', () => {
  const { clock, instance } = driver('idle', { reduced: true })
  assert.equal(instance.current, 'neutral')
  assert.equal(clock.pending, 0)
  instance.setState('speaking')
  assert.equal(instance.current, 'speaking')
  assert.equal(clock.pending, 0, '说话交替也要停')
  instance.setState('running')
  assert.equal(instance.current, 'thinking')
  assert.equal(clock.pending, 0)
})

test('卸载：dispose 后计时器被清掉，回调不再触发', () => {
  const { clock, faces, instance } = driver('idle', { random: () => 0 })
  instance.dispose()
  assert.equal(clock.pending, 0)
  clock.advance(30000)
  assert.deepEqual(faces, [])
  instance.setState('speaking')
  clock.advance(30000)
  assert.deepEqual(faces, [])
})
