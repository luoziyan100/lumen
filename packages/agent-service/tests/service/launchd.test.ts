/**
 * [INPUT]: renderLaunchAgentPlist / resolveLaunchAgentPaths
 * [OUTPUT]: plist 字段与路径不变式
 * [POS]: launchd 渲染纯函数验收;不碰本机 launchctl
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  renderLaunchAgentPlist,
  resolveLaunchAgentPaths,
  LAUNCH_AGENT_LABEL,
  type LaunchAgentPaths,
} from '../../src/launchd.ts'

test('resolveLaunchAgentPaths:尊重 LUMEN_SERVICE_DIR / LUMEN_HOME / LUMEN_NODE', () => {
  const paths = resolveLaunchAgentPaths({
    LUMEN_SERVICE_DIR: '/tmp/fake-service',
    LUMEN_HOME: '/tmp/fake-lumen-home',
    LUMEN_NODE: '/tmp/fake-node',
  }, '/Users/demo')
  assert.equal(paths.serviceDir, '/tmp/fake-service')
  assert.equal(paths.serviceEntry, '/tmp/fake-service/src/service.ts')
  assert.equal(paths.lumenHome, '/tmp/fake-lumen-home')
  assert.equal(paths.node, '/tmp/fake-node')
  assert.equal(paths.plistPath, '/Users/demo/Library/LaunchAgents/com.lumen.agent-service.plist')
})

test('renderLaunchAgentPlist:含 Label / KeepAlive / 路径与端口', () => {
  const paths: LaunchAgentPaths = {
    node: '/opt/homebrew/bin/node',
    serviceDir: '/repo/packages/agent-service',
    serviceEntry: '/repo/packages/agent-service/src/service.ts',
    lumenHome: '/Users/x/.lumen',
    logDir: '/Users/x/.lumen/logs',
    stdoutLog: '/Users/x/.lumen/logs/agent-service.out.log',
    stderrLog: '/Users/x/.lumen/logs/agent-service.err.log',
    plistPath: '/Users/x/Library/LaunchAgents/com.lumen.agent-service.plist',
  }
  const xml = renderLaunchAgentPlist(paths, 8787)
  assert.match(xml, new RegExp(`<string>${LAUNCH_AGENT_LABEL}</string>`))
  assert.match(xml, /<key>KeepAlive<\/key>\s*<true\/>/)
  assert.match(xml, /<key>RunAtLoad<\/key>\s*<true\/>/)
  assert.match(xml, /<string>8787<\/string>/)
  assert.match(xml, /<string>\/opt\/homebrew\/bin\/node<\/string>/)
  assert.match(xml, /<string>\/repo\/packages\/agent-service\/src\/service\.ts<\/string>/)
  assert.match(xml, /<string>\/Users\/x\/\.lumen<\/string>/)
})

test('renderLaunchAgentPlist:XML 转义特殊字符路径', () => {
  const paths: LaunchAgentPaths = {
    node: '/tmp/node',
    serviceDir: '/tmp/a&b',
    serviceEntry: '/tmp/a&b/src/service.ts',
    lumenHome: '/tmp/<home>',
    logDir: '/tmp/<home>/logs',
    stdoutLog: '/tmp/<home>/logs/out.log',
    stderrLog: '/tmp/<home>/logs/err.log',
    plistPath: '/tmp/x.plist',
  }
  const xml = renderLaunchAgentPlist(paths)
  assert.match(xml, /a&amp;b/)
  assert.match(xml, /&lt;home&gt;/)
  assert.doesNotMatch(xml, /a&b/)
})
