import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import * as path from 'node:path'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import { createRunCodeTool, runCodeTool, seatbeltProfile } from '../../src/tools/env/run-code/index.ts'
import { noopCtx } from '../helpers/scripted-model.ts'

const darwin = process.platform === 'darwin'

async function makeWs(t: TestContext): Promise<FsWorkspace> {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-runcode-'))
  const root = path.join(base, 'workspace')
  await mkdir(root, { recursive: true })
  t.after(() => rm(base, { recursive: true, force: true }))
  return new FsWorkspace({ root })
}

test('run_code:node hello 经真实执行,stdout 回灌,脚本落 scratch/', async (t) => {
  const ws = await makeWs(t)
  const r = await runCodeTool.run(
    { language: 'node', code: 'console.log("hello-" + (40 + 2))' },
    noopCtx({ workspace: ws }),
  )
  assert.match(r.llmContent, /退出码 0/)
  assert.match(r.llmContent, /hello-42/)
  assert.ok((await ws.glob('scratch/*.mjs')).length >= 1, '脚本已存 scratch/(编号随全局自增,存在即可)')
})

test('run_code:能读写工作区文件(cwd=工作区根)', async (t) => {
  const ws = await makeWs(t)
  await ws.writeFile('notes/in.txt', '7')
  const r = await runCodeTool.run(
    {
      language: 'node',
      code: `import { readFileSync, writeFileSync } from 'node:fs'
const n = Number(readFileSync('notes/in.txt', 'utf8'))
writeFileSync('notes/out.txt', String(n * 6))
console.log('done')`,
    },
    noopCtx({ workspace: ws }),
  )
  assert.match(r.llmContent, /退出码 0/)
  assert.equal(await ws.readFile('notes/out.txt'), '42')
})

test('run_code:超时被终止并如实报告', async (t) => {
  const ws = await makeWs(t)
  const r = await runCodeTool.run(
    { language: 'node', code: 'setInterval(() => {}, 1000)', timeoutSeconds: 1 },
    noopCtx({ workspace: ws }),
  )
  assert.match(r.llmContent, /超时\(1s\)被终止/)
})

test('run_code(Seatbelt):写工作区外(系统路径)被拒 —— 沙箱逃逸验收', { skip: !darwin }, async (t) => {
  const ws = await makeWs(t)
  const escape = `/Users/Shared/lumen-escape-${Date.now()}.txt`
  const r = await runCodeTool.run(
    {
      language: 'node',
      code: `import { writeFileSync } from 'node:fs'
try { writeFileSync(${JSON.stringify(escape)}, 'pwned'); console.log('WROTE') }
catch (e) { console.log('BLOCKED:' + e.code) }`,
    },
    noopCtx({ workspace: ws }),
  )
  assert.ok(!existsSync(escape), '工作区外文件绝不能被创建')
  assert.match(r.llmContent, /BLOCKED:/, '脚本内感知到 EPERM 类拒绝')
  assert.doesNotMatch(r.llmContent, /WROTE/)
})

test('run_code(Seatbelt):读 ~/.ssh 等敏感目录被拒 —— 隐私边界验收', { skip: !darwin }, async (t) => {
  const ws = await makeWs(t)
  const secret = path.join(homedir(), '.ssh')
  const r = await runCodeTool.run(
    {
      language: 'node',
      code: `import { readdirSync } from 'node:fs'
try { readdirSync(${JSON.stringify(secret)}); console.log('READ-OK') }
catch (e) { console.log('BLOCKED:' + e.code) }`,
    },
    noopCtx({ workspace: ws }),
  )
  assert.match(r.llmContent, /BLOCKED:/)
  assert.doesNotMatch(r.llmContent, /READ-OK/)
})

test('run_code(Seatbelt):网络默认全禁 —— 外联验收', { skip: !darwin }, async (t) => {
  const ws = await makeWs(t)
  const r = await runCodeTool.run(
    {
      language: 'node',
      code: `import net from 'node:net'
const s = net.connect(80, '1.1.1.1')
s.on('error', (e) => { console.log('NETBLOCKED:' + e.code); process.exit(0) })
s.on('connect', () => { console.log('CONNECTED'); process.exit(0) })`,
      timeoutSeconds: 10,
    },
    noopCtx({ workspace: ws }),
  )
  assert.match(r.llmContent, /NETBLOCKED:/)
  assert.doesNotMatch(r.llmContent, /CONNECTED/)
})

test('run_code(Seatbelt):工作区在 ~/.lumen/workspaces 下可执行 —— 生产路径回归', { skip: !darwin }, async (t) => {
  const root = path.join(homedir(), '.lumen', 'workspaces', `_runcode_probe_${Date.now()}`)
  await mkdir(root, { recursive: true })
  t.after(() => rm(root, { recursive: true, force: true }))
  const ws = new FsWorkspace({ root })
  const r = await runCodeTool.run(
    { language: 'node', code: 'console.log("ok-under-lumen")' },
    noopCtx({ workspace: ws }),
  )
  assert.match(r.llmContent, /退出码 0/, r.llmContent)
  assert.match(r.llmContent, /ok-under-lumen/)
})

/** 改 profile 前冻结的无代理快照;演习二:缺省必须逐字节一致 */
const FROZEN_SEATBELT_NO_PROXY =
  '(version 1)\n(allow default)\n(deny network*)\n(deny file-write*)\n(allow file-write*\n  (subpath "/tmp/ws")\n  (subpath "/private/var/folders") (subpath "/private/tmp")\n  (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr") (literal "/dev/tty"))\n(deny file-read*\n  (subpath "/Users/me/.ssh")\n  (subpath "/Users/me/.aws")\n  (subpath "/Users/me/.gnupg")\n  (subpath "/Users/me/.config/gcloud")\n  (subpath "/Users/me/Library/Keychains")\n  (subpath "/Users/me/Library/Application Support")\n  (subpath "/Users/me/.zsh_history")\n  (subpath "/Users/me/.bash_history")\n  (subpath "/Users/me/.netrc")\n  (literal "/Users/me/.lumen/agent-service.json")\n  (literal "/Users/me/.lumen/settings.json")\n  (literal "/Users/me/.zshrc") (literal "/Users/me/.bashrc") (literal "/Users/me/.profile") (literal "/Users/me/.zshenv"))\n(allow file-read*\n  (subpath "/Users/me/.lumen/skills")\n  (subpath "/Users/me/.lumen/workspaces")\n  (subpath "/tmp/ws"))\n'

test('seatbeltProfile 无 proxyPort 与改前快照逐字节一致', () => {
  assert.equal(seatbeltProfile('/tmp/ws', '/Users/me'), FROZEN_SEATBELT_NO_PROXY)
  assert.equal(seatbeltProfile('/tmp/ws', '/Users/me', {}), FROZEN_SEATBELT_NO_PROXY)
})

test('run_code:network:true 经代理 fetch 本地假上游成功', async (t) => {
  const upstream = http.createServer((_req, res) => { res.end('FETCH_OK') })
  t.after(() => upstream.close())
  const upPort = await new Promise<number>((resolve, reject) => {
    upstream.listen(0, '127.0.0.1', () => {
      const addr = upstream.address()
      if (!addr || typeof addr === 'string') reject(new Error('bind failed'))
      else resolve(addr.port)
    })
  })
  const ws = await makeWs(t)
  const tool = createRunCodeTool({ allowedDomains: ['127.0.0.1'] })
  const r = await tool.run(
    {
      language: 'node',
      network: true,
      code: `const r = await fetch("http://127.0.0.1:${upPort}/")
console.log(await r.text())`,
    },
    noopCtx({ workspace: ws }),
  )
  assert.match(r.llmContent, /退出码 0/, r.llmContent)
  assert.match(r.llmContent, /FETCH_OK/, r.llmContent)
  assert.doesNotMatch(r.llmContent, /网络白名单拒绝/)
})

test('run_code:network:true 名单外主机拒绝进 llmContent', async (t) => {
  const ws = await makeWs(t)
  const tool = createRunCodeTool({ allowedDomains: ['127.0.0.1'] })
  const r = await tool.run(
    {
      language: 'node',
      network: true,
      timeoutSeconds: 15,
      code: `try {
  const r = await fetch("http://evil.example.com/")
  console.log("STATUS:" + r.status + " BODY:" + await r.text())
} catch (e) {
  console.log("FETCHERR:" + e.message)
}`,
    },
    noopCtx({ workspace: ws }),
  )
  assert.match(r.llmContent, /网络白名单拒绝/, r.llmContent)
  assert.match(r.llmContent, /evil.example.com/, r.llmContent)
})

test('run_code(Seatbelt):network:true 直连假上游端口被拒 —— 绕代理必死', { skip: !darwin }, async (t) => {
  const upstream = http.createServer((_req, res) => { res.end('SHOULD_NOT') })
  t.after(() => upstream.close())
  const upPort = await new Promise<number>((resolve, reject) => {
    upstream.listen(0, '127.0.0.1', () => {
      const addr = upstream.address()
      if (!addr || typeof addr === 'string') reject(new Error('bind failed'))
      else resolve(addr.port)
    })
  })
  const ws = await makeWs(t)
  const tool = createRunCodeTool({ allowedDomains: ['127.0.0.1'] })
  const r = await tool.run(
    {
      language: 'node',
      network: true,
      timeoutSeconds: 10,
      code: `import net from 'node:net'
const s = net.connect(${upPort}, '127.0.0.1')
s.on('error', (e) => { console.log('NETBLOCKED:' + e.code); process.exit(0) })
s.on('connect', () => { console.log('CONNECTED'); process.exit(0) })`,
    },
    noopCtx({ workspace: ws }),
  )
  assert.match(r.llmContent, /NETBLOCKED:/, r.llmContent)
  assert.doesNotMatch(r.llmContent, /CONNECTED/)
})

test('run_code(Seatbelt):读 ~/.lumen/agent-service.json 仍被拒', { skip: !darwin }, async (t) => {
  const ws = await makeWs(t)
  const secret = path.join(homedir(), '.lumen', 'agent-service.json')
  const r = await runCodeTool.run(
    {
      language: 'node',
      code: `import { readFileSync } from 'node:fs'
try { readFileSync(${JSON.stringify(secret)}, 'utf8'); console.log('READ-OK') }
catch (e) { console.log('BLOCKED:' + e.code) }`,
    },
    noopCtx({ workspace: ws }),
  )
  assert.match(r.llmContent, /BLOCKED:/, r.llmContent)
  assert.doesNotMatch(r.llmContent, /READ-OK/)
})

test('run_code:language 与首行不符且 SyntaxError 时给提示', async (t) => {
  const ws = await makeWs(t)
  const r = await runCodeTool.run(
    { language: 'node', code: 'def hello():\n    print(1)\n' },
    noopCtx({ workspace: ws }),
  )
  assert.match(r.llmContent, /SyntaxError/, r.llmContent)
  assert.match(r.llmContent, /检查 language 参数是否与代码语言一致/)
})
