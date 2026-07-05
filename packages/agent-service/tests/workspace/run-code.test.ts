import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import * as path from 'node:path'
import { FsWorkspace } from '../../src/workspace/fs-workspace.ts'
import { runCodeTool } from '../../src/tools/env/run-code.ts'
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
