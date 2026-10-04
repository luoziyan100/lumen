/**
 * [INPUT]: 合成 launchctl 调度、真实 Node 24 子进程和本机认证 HTTP
 * [OUTPUT]: 私有部署安装/重启/卸载、崩溃恢复和所有权冲突行为证明
 * [POS]: 只替换系统注册边界；不注册真实 LaunchAgent，不读取正式 Lumen 根
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { deploymentConfig, renderPlist } from '../../src/deployment/config.ts'
import { createLaunchdDeployment, parseJob } from '../../src/deployment/launchd.ts'
import { readDiscovery } from '../../src/deployment/discovery.ts'
import { processAlive } from '../../src/deployment/lock.ts'
import { childProcess, launchctlFixture, terminate } from './fixture.ts'

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url))

async function setup(healthDelay = 0) {
  const temporary = await mkdtemp(join(tmpdir(), 'mastra deployment & '))
  const options = { nodePath: process.execPath, projectRoot, dataRoot: join(temporary, 'data'), launchAgentsDir: join(temporary, 'LaunchAgents') }
  const config = await deploymentConfig(options)
  const fixture = launchctlFixture(config, healthDelay)
  const deployment = await createLaunchdDeployment(options, { run: fixture.run, timeoutMs: 5000, pollMs: 15 })
  return { temporary, options, config, fixture, deployment, close: async () => { await fixture.close(); await rm(temporary, { recursive: true, force: true }) } }
}

test('install waits for authenticated health, explicit restart replaces only its job, uninstall preserves data', async () => {
  const context = await setup(250)
  try {
    const { config, fixture, deployment } = context
    assert.equal(config.label, 'com.lumen.mastra')
    const started = Date.now()
    const installed = await deployment.install()
    assert.equal(installed.state, 'ready')
    assert.ok(Date.now() - started >= 200)
    const discovery = await readDiscovery(config.dataRoot)
    assert.equal(installed.pid, discovery!.pid)
    assert.ok(!JSON.stringify(installed).includes(discovery!.token))
    const plist = await readFile(config.plistPath, 'utf8')
    assert.equal(plist, renderPlist(config))
    assert.match(plist, /&amp;/)
    assert.match(plist, /<key>Umask<\/key><integer>63<\/integer>/)
    for (const path of [config.plistPath, config.stdoutPath, config.stderrPath, join(config.dataRoot, 'mastra-service.json')]) assert.equal((await stat(path)).mode & 0o777, 0o600)
    assert.equal((await stat(config.logDir)).mode & 0o777, 0o700)
    assert.equal((await deployment.install()).pid, installed.pid)
    assert.equal(fixture.calls.filter(call => call[0] === 'bootstrap').length, 1)
    await writeFile(join(config.dataRoot, 'keep.txt'), 'user work')
    const restarted = await deployment.install({ restart: true })
    assert.equal(restarted.state, 'ready')
    assert.notEqual(restarted.pid, installed.pid)
    assert.equal(processAlive(installed.pid!), false)
    const removed = await deployment.uninstall()
    assert.equal(removed.state, 'absent')
    assert.equal(removed.installed, false)
    assert.equal(await readFile(join(config.dataRoot, 'keep.txt'), 'utf8'), 'user work')
    assert.equal(await readDiscovery(config.dataRoot), null)
    assert.ok((await stat(join(config.dataRoot, 'mastra-service.owner'))).isFile())
    assert.ok(fixture.calls.every(call => !call.some(value => value === 'com.lumen.agent-service')))
  } finally { await context.close() }
})

test('unknown live discovery owner and held startup without discovery never trigger bootstrap or bootout', async () => {
  const context = await setup()
  const external = await childProcess(context.config.dataRoot, 'server')
  try {
    const before = await readFile(join(context.config.dataRoot, 'mastra-service.json'), 'utf8')
    assert.equal((await context.deployment.status()).state, 'conflict')
    await assert.rejects(() => context.deployment.install(), /another live process/)
    await assert.rejects(() => context.deployment.uninstall(), /another live process/)
    assert.equal(await readFile(join(context.config.dataRoot, 'mastra-service.json'), 'utf8'), before)
    assert.ok(context.fixture.calls.every(call => call[0] === 'print'))
  } finally { await terminate(external); await context.close() }
  const pending = await setup()
  const holder = await childProcess(pending.config.dataRoot)
  try {
    await assert.rejects(() => pending.deployment.install(), /Another service owns/)
    assert.ok(pending.fixture.calls.every(call => call[0] === 'print'))
  } finally { await terminate(holder); await pending.close() }
})

test('crashed job restarts with a new token and stale discovery cannot satisfy readiness', async () => {
  const context = await setup()
  try {
    const first = await context.deployment.install()
    const oldDiscovery = await readDiscovery(context.config.dataRoot)
    await terminate(context.fixture.child()!, 'SIGKILL')
    assert.equal((await context.deployment.status()).state, 'starting')
    const recovered = await context.deployment.install()
    const currentDiscovery = await readDiscovery(context.config.dataRoot)
    assert.equal(recovered.state, 'ready')
    assert.notEqual(recovered.pid, first.pid)
    assert.notEqual(currentDiscovery!.token, oldDiscovery!.token)
    await writeFile(join(context.config.dataRoot, 'mastra-service.json'), JSON.stringify({ ...currentDiscovery, token: '0'.repeat(64) }), { mode: 0o600 })
    assert.equal((await context.deployment.status()).state, 'unhealthy')
    await writeFile(join(context.config.dataRoot, 'mastra-service.json'), JSON.stringify({ ...currentDiscovery, pid: process.pid }), { mode: 0o600 })
    assert.equal((await context.deployment.status()).state, 'conflict')
    const stops = context.fixture.calls.filter(call => call[0] === 'bootout').length
    await assert.rejects(() => context.deployment.uninstall(), /another live process/)
    assert.equal(context.fixture.calls.filter(call => call[0] === 'bootout').length, stops)
  } finally { await context.close() }
})

test('foreign plist, unknown launchctl output and wrong Node version fail closed', async () => {
  const context = await setup()
  try {
    await context.deployment.install()
    await context.deployment.uninstall()
    await writeFile(context.config.plistPath, '<plist>some other service</plist>', { mode: 0o600 })
    await assert.rejects(() => context.deployment.install(), /another deployment configuration/)
    assert.equal(await readFile(context.config.plistPath, 'utf8'), '<plist>some other service</plist>')
    await rm(context.config.plistPath)
    const badNode = await createLaunchdDeployment(context.options, { run: async (program, args) => program === '/bin/launchctl' ? context.fixture.run(program, args) : { code: 0, stdout: 'v23.0.0\n', stderr: '' } })
    await assert.rejects(() => badNode.install(), /Node.js 24/)
    assert.equal(parseJob({ code: 0, stdout: 'unexpected output', stderr: '' }).state, 'unknown')
    assert.throws(() => parseJob({ code: 5, stdout: '', stderr: 'permission denied' }), /Unable to inspect/)
    await assert.rejects(() => deploymentConfig({ ...context.options, nodePath: 'node' }), /absolute/)
  } finally { await context.close() }
})
