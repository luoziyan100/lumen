/**
 * [INPUT]: 原生投影负载校验和桌面过渡纯参数
 * [OUTPUT]: P7 只接受四态字符串与 P8 的 180ms/120ms 动效约束
 * [POS]: 桌面协议与动效回归；生命周期/位置/菜单由真实 Rust 模型测试，渲染由浏览器与原生脚本验收
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { isSpriteState } from '../src/mastra/studio/sprite-desktop/state.ts'
import { desktopMotion } from '../src/mastra/studio/sprite-desktop/motion.ts'

test('状态投影只接受四态字符串', () => {
  for (const state of ['idle', 'running', 'waiting', 'speaking']) assert.ok(isSpriteState(state))
  for (const item of [null, undefined, {}, 'unknown', 'Idle', 0, { state: 'idle' }]) assert.equal(isSpriteState(item), false)
})

test('桌面过渡只改变合成属性，减弱动效只淡120ms', () => {
  for (const reduced of [false, true]) {
    const enter = desktopMotion(true, reduced), leave = desktopMotion(false, reduced)
    assert.equal(enter.duration, reduced ? 120 : 180)
    assert.deepEqual(leave.frames, [...enter.frames].reverse())
    for (const frame of enter.frames) assert.deepEqual(Object.keys(frame).sort(), reduced ? ['opacity'] : ['opacity', 'transform'])
  }
})
