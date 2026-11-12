/**
 * [INPUT]: 合成 launchctl 调度、真实 Node 24 子进程和本机认证 HTTP
 * [OUTPUT]: 私有部署安装/重启/卸载、崩溃恢复、旧版 plist 原地升级、plist 形状快照(强制登记历史渲染)、
 *           凭证不进 plist 且 .env 必须为本人 0600 普通文件，所有权冲突，以及拒绝旧 label/旧形态数据根的行为证明
 * [POS]: 只替换系统注册边界；不注册真实 LaunchAgent，不读取正式 Lumen 根
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { chmod, link, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { deploymentConfig, renderPlist, renderPreviousPlists, secretsPath } from '../../src/deployment/config.ts'
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
    assert.equal(config.label, 'com.lumen.studio')
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

test('旧版 plist 视为同一部署并在 install 时原地升级；凭证只经数据根 .env，不进 plist', async () => {
  const context = await setup()
  try {
    const { config, fixture, deployment } = context
    await deployment.install()
    const [legacy] = renderPreviousPlists(config)
    await writeFile(config.plistPath, legacy!, { mode: 0o600 })
    const outdated = await deployment.status()
    assert.equal(outdated.state, 'ready')
    assert.equal(outdated.outdated, true)
    const before = fixture.calls.filter(call => call[0] === 'bootstrap').length
    const upgraded = await deployment.install()
    assert.equal(upgraded.state, 'ready')
    assert.equal(upgraded.outdated, undefined)
    assert.equal(fixture.calls.filter(call => call[0] === 'bootstrap').length, before + 1, '旧版需要重新引导以载入新参数')
    const plist = await readFile(config.plistPath, 'utf8')
    assert.equal(plist, renderPlist(config))
    assert.ok(plist.includes(`--env-file-if-exists=${secretsPath(config).replaceAll('&', '&amp;')}`))
    assert.doesNotMatch(plist, /TAVILY|OPENALEX|API_KEY/)
    await writeFile(config.plistPath, legacy!, { mode: 0o600 })
    assert.equal((await deployment.uninstall()).state, 'absent', '旧版同样可卸载')
  } finally { await context.close() }
})

test('plist 形状快照：改 renderPlist 必须把旧渲染登记进 renderPreviousPlists', async () => {
  const context = await setup()
  try {
    const { config } = context
    const args = [config.nodePath, '--experimental-strip-types', `--env-file-if-exists=${secretsPath(config)}`, config.entryPath, '--data-root', config.dataRoot]
    const xml = (v: string) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
    const snapshot = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(config.label)}</string>
  <key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join('')}</array>
  <key>WorkingDirectory</key><string>${xml(config.projectRoot)}</string>
  <key>EnvironmentVariables</key><dict><key>NODE_ENV</key><string>production</string><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>ExitTimeOut</key><integer>45</integer>
  <key>Umask</key><integer>63</integer>
  <key>StandardOutPath</key><string>${xml(config.stdoutPath)}</string>
  <key>StandardErrorPath</key><string>${xml(config.stderrPath)}</string>
</dict></plist>
`
    assert.equal(renderPlist(config), snapshot, 'renderPlist 输出变了：把本快照(改动前的渲染)追加进 renderPreviousPlists，再把快照更新为新形状')
    assert.ok(!renderPreviousPlists(config).includes(snapshot), '当前形状不应同时出现在历史白名单里')
  } finally { await context.close() }
})

test('install 拒绝非私有、软链或硬链的 .env，且不触碰现有部署；缺失与 0600 放行', async () => {
  const context = await setup()
  try {
    const { config, fixture, deployment } = context
    const secrets = secretsPath(config)
    const installed = await deployment.install()
    const calls = () => fixture.calls.filter(call => call[0] !== 'print').length
    const before = calls()
    await writeFile(secrets, 'TAVILY_API_KEY=x\n', { mode: 0o644 })
    await chmod(secrets, 0o644)
    await assert.rejects(() => deployment.install({ restart: true }), /Research secrets file .* must be a private regular file/)
    await rm(secrets)
    const outside = join(context.temporary, 'elsewhere.env')
    await writeFile(outside, 'TAVILY_API_KEY=x\n', { mode: 0o600 })
    await symlink(outside, secrets)
    await assert.rejects(() => deployment.install({ restart: true }), /must be a private regular file/, '软链(lstat 权限 0755)按非私有拒绝')
    await rm(secrets)
    await link(outside, secrets)
    await assert.rejects(() => deployment.install({ restart: true }), /must not be a link/)
    await rm(secrets)
    assert.equal(calls(), before, '校验失败时不得 bootout/bootstrap')
    assert.equal((await deployment.status()).pid, installed.pid)
    await writeFile(secrets, 'TAVILY_API_KEY=x\n', { mode: 0o600 })
    assert.equal((await deployment.install({ restart: true })).state, 'ready')
    const plist = await readFile(config.plistPath, 'utf8')
    assert.ok(!plist.includes('TAVILY_API_KEY=x'))
  } finally { await context.close() }
})

test('新形态部署不接管旧服务 label，也不部署到旧形态数据根', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'studio-legacy-guard-'))
  try {
    const base = { nodePath: process.execPath, projectRoot, launchAgentsDir: join(temporary, 'LaunchAgents') }
    await assert.rejects(deploymentConfig({ ...base, dataRoot: join(temporary, 'data'), label: 'com.lumen.mastra' }), /legacy com\.lumen\.mastra/)
    for (const legacy of ['.lumen-mastra', '.lumen']) {
      await assert.rejects(deploymentConfig({ ...base, dataRoot: join(homedir(), legacy) }), /independent data root/)
    }
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
