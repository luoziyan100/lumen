/**
 * [INPUT]: 真实 start.ts 子进程、临时 HOME 与数据根、当前形态的旧 settings.json（假凭证）
 * [OUTPUT]: 新根设置一次性导入且凭证不外泄（输出、HTTP 都只见掩码，落盘 0600）；旧形态数据根（~/.lumen、~/.lumen-mastra）被拒绝且不建任何文件
 * [POS]: S1 新数据根的启动边界验收；HOME 指向临时目录，绝不触碰真实旧根
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDiscovery } from '../../src/deployment/discovery.ts'

const entry = fileURLToPath(new URL('../../src/start.ts', import.meta.url))
const SECRET = 'sk-studio-import-secret-0123456789abcdef'

function start(home: string, args: string[]) {
  const child = spawn(process.execPath, ['--experimental-strip-types', entry, ...args], {
    env: { PATH: process.env.PATH, HOME: home, NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  const exited = new Promise<number | null>(done => child.once('exit', code => done(code)))
  return { child, exited, output: () => output }
}

test('新根从旧 settings.json 一次性导入模型档案，凭证不出现在输出与 HTTP 里', { timeout: 60000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'lumen-studio-start-'))
  const legacy = join(home, 'old-settings.json'), root = join(home, '.lumen-studio-dev')
  await writeFile(legacy, JSON.stringify({ version: 1, activeProfileId: 'mp-gpt', userInstructions: '用中文', collectExecEvidence: true, researchBudget: {},
    profiles: [{ id: 'mp-gpt', name: 'GPT', provider: 'openai', baseUrl: 'https://llm.example/v1', apiKey: SECRET, models: ['gpt-test'], activeModel: 'gpt-test', vision: 'auto' }] }))
  const service = start(home, ['--data-root', root, '--settings', legacy])
  try {
    let discovery = null
    for (let attempt = 0; attempt < 200 && !discovery; attempt++) {
      discovery = await readDiscovery(root).catch(() => null)
      if (!discovery) await new Promise(done => setTimeout(done, 100))
    }
    assert.ok(discovery, `服务没有就绪：${service.output()}`)
    const response = await fetch(`${discovery.baseUrl}/lumen/settings`, { headers: { Authorization: `Bearer ${discovery.token}` } })
    const body = await response.text()
    assert.equal(response.status, 200)
    assert.ok(!body.includes(SECRET), 'HTTP 只返回掩码')
    const settings = JSON.parse(body) as { activeProfileId: string; userInstructions: string; profiles: Array<{ activeModel: string; apiKey?: string }> }
    assert.deepEqual([settings.activeProfileId, settings.userInstructions, settings.profiles[0]!.activeModel], ['mp-gpt', '用中文', 'gpt-test'])
    assert.equal((await stat(join(root, 'settings.json'))).mode & 0o777, 0o600)
    assert.ok((await readFile(join(root, 'settings.json'), 'utf8')).includes(SECRET), '凭证只存在新根的私有文件里')
  } finally {
    service.child.kill('SIGTERM')
    await service.exited
    assert.ok(!service.output().includes(SECRET), '服务输出不含凭证')
    await rm(home, { recursive: true, force: true })
  }
})

test('旧形态数据根被拒绝，且不在其中建任何文件', { timeout: 30000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'lumen-studio-legacy-'))
  try {
    for (const name of ['.lumen-mastra', '.lumen']) {
      const legacy = join(home, name)
      await mkdir(legacy)
      const service = start(home, ['--data-root', legacy])
      assert.notEqual(await service.exited, 0)
      assert.match(service.output(), /cannot open a legacy data root/)
      assert.deepEqual(await readdir(legacy), [], `${name} 里不能出现锁、数据库或发现文件`)
    }
  } finally { await rm(home, { recursive: true, force: true }) }
})
