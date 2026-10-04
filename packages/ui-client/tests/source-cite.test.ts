/**
 * [INPUT]: 现役外链门禁使用的 hostOf
 * [OUTPUT]: 对话框与受信站点判断共享的主机名解析回归
 * [POS]: 验证主机名规范化与非法链接边界；退役来源列表不保留算法测试
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { hostOf } from '../src/sourceCite.ts'

it('外链主机名去掉 www、端口和路径，非法链接保持空值', () => {
  assert.equal(hostOf('https://www.Example.com:8443/research?q=1#result'), 'example.com')
  assert.equal(hostOf('https://docs.example.com/paper'), 'docs.example.com')
  assert.equal(hostOf('not a URL'), '')
})
