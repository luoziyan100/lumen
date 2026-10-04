/**
 * [INPUT]: 真实 macOS Seatbelt/Node/Python 与临时任务 LocalFilesystem
 * [OUTPUT]: 进程文件边界、生命周期和输出限额的现场验证
 * [POS]: OS 集成验证；不替换 spawn 或 sandbox，不接触用户数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile, symlink, access, watch } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { LocalFilesystem } from '@mastra/core/workspace'
import { runCode } from '../../src/execution/process.ts'

const mac = { skip: process.platform !== 'darwin', timeout: 30_000 }

test('真实 Node/Python 在当前任务生成文件，跨目录和软链读取/写入被拒绝', mac, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-execution-boundary-'))
  const filesystem = new LocalFilesystem({ basePath: join(root, 'task'), contained: true })
  await filesystem.init()
  try {
    await writeFile(join(root, 'secret'), 'OTHER_TASK_PRIVATE')
    await symlink(join(root, 'secret'), join(filesystem.basePath, 'leak'))
    const result = await runCode({ filesystem }, { language: 'node', code: `
      import fs from 'node:fs';
      for (const path of [${JSON.stringify(join(root, 'secret'))}, 'leak']) {
        for (const operation of [() => fs.readFileSync(path), () => fs.writeFileSync(path, 'broken')]) {
          try { operation(); throw new Error('ISOLATION_FAILED'); }
          catch (error) { if (!['EPERM','EACCES'].includes(error.code)) throw error; }
        }
      }
      fs.writeFileSync('node-result.txt', 'NODE_OK'); console.log('NODE_OK');
    ` })
    assert.equal(result.exitCode, 0, result.stderr)
    assert.match(result.stdout, /NODE_OK/)
    assert.equal(await readFile(join(root, 'secret'), 'utf8'), 'OTHER_TASK_PRIVATE')
    assert.equal(await readFile(join(filesystem.basePath, 'node-result.txt'), 'utf8'), 'NODE_OK')
    const py = await runCode({ filesystem }, { language: 'python', code: "from pathlib import Path\nPath('python-result.txt').write_text('PYTHON_OK')\nprint('PYTHON_OK')" })
    assert.equal(py.exitCode, 0, py.stderr)
    assert.equal(py.stderr, '')
    assert.match(py.stdout, /PYTHON_OK/)
    assert.equal(await readFile(join(filesystem.basePath, 'python-result.txt'), 'utf8'), 'PYTHON_OK')
  } finally { await filesystem.destroy(); await rm(root, { recursive: true, force: true }) }
})

test('超时结束进程组，取消等待进程退出，输出日志具有硬上限', mac, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-execution-lifecycle-'))
  const filesystem = new LocalFilesystem({ basePath: root, contained: true })
  try {
    const timeout = await runCode({ filesystem }, { language: 'node', timeoutSeconds: 1, code: 'setInterval(()=>{}, 1000)' })
    assert.equal(timeout.timedOut, true)
    assert.equal(timeout.cancelled, false)
    const controller = new AbortController()
    const changes = watch(root)
    const cancel = (async () => {
      for await (const event of changes) if (event.filename === 'ready') { controller.abort(); return }
    })()
    const cancelled = await runCode({ filesystem }, { language: 'node', code: `
      import { spawn } from 'node:child_process';
      import fs from 'node:fs';
      const child = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1000)']);
      fs.writeFileSync('child.pid', String(child.pid)); fs.writeFileSync('ready', '1'); setInterval(()=>{}, 1000);
    ` }, controller.signal)
    await cancel
    assert.equal(cancelled.cancelled, true)
    assert.equal(cancelled.timedOut, false)
    const childPid = Number(await readFile(join(root, 'child.pid'), 'utf8'))
    assert.throws(() => process.kill(childPid, 0), /ESRCH/)
    const output = await runCode({ filesystem }, { language: 'node', code: "process.stdout.write('x'.repeat(500000)); process.stderr.write('y'.repeat(500000))" })
    assert.equal(output.exitCode, 0)
    assert.equal(output.stdout.length, 6000)
    assert.equal(output.stderr.length, 6000)
    assert.equal(output.truncated, true)
    for (const stream of ['stdout', 'stderr']) {
      const log = await readFile(join(root, output.runPath, `${stream}.log`))
      assert.ok(log.byteLength < 400_200)
      assert.match(log.toString(), /后续输出已丢弃/)
    }
  } finally { await filesystem.destroy(); await rm(root, { recursive: true, force: true }) }
})

test('默认禁止真实网络连接，不允许无白名单开启网络或只读文件系统执行', mac, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-execution-network-'))
  const filesystem = new LocalFilesystem({ basePath: root, contained: true })
  const server = createServer(socket => socket.end('should-not-connect'))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  try {
    const result = await runCode({ filesystem }, { language: 'node', code: `
      import net from 'node:net';
      const socket = net.connect(${address.port}, '127.0.0.1');
      socket.on('connect', () => { console.log('CONNECTED'); process.exitCode=1; socket.destroy() });
      socket.on('error', error => { console.log(error.code); if (!['EPERM','EACCES'].includes(error.code)) process.exitCode=2 });
    ` })
    assert.equal(result.exitCode, 0, result.stderr)
    assert.match(result.stdout, /EPERM|EACCES/)
    const proxied = await runCode({ filesystem, allowedDomains: ['example.org'] }, { language: 'node', network: true,
      code: "import { execFileSync } from 'node:child_process'; execFileSync(process.execPath, ['-e', \"fetch('http://blocked.invalid').catch(error => { console.error(error); process.exitCode = 1 })\"], { stdio: 'inherit' })",
    })
    assert.equal(proxied.exitCode, 1)
    assert.match(proxied.stderr, /Proxy response \(403\)/)
    assert.match(proxied.networkDenials.join('\n'), /blocked.invalid/)
    await assert.rejects(runCode({ filesystem }, { language: 'node', code: '1', network: true }), /未配置/)
    const reader = new LocalFilesystem({ basePath: root, contained: true, readOnly: true })
    await assert.rejects(runCode({ filesystem: reader }, { language: 'node', code: '1' }), /可写/)
    await assert.rejects(access(join(root, 'should-not-exist')))
  } finally { server.close(); await filesystem.destroy(); await rm(root, { recursive: true, force: true }) }
})
