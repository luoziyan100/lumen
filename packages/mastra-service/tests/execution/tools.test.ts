/**
 * [INPUT]: 真实 Mastra Agent/Controller、Seatbelt 工具、模型 HTTP 夹具与隔离技能包
 * [OUTPUT]: 箱内自动执行、失败修正、技能只读资源和显式权限保留的证据
 * [POS]: 验证 run_code 进入框架循环，而非只验证进程帮助函数
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readFile, access, rename, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { LocalFilesystem } from '@mastra/core/workspace'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createExecutionTools } from '../../src/execution/tools.ts'
import { createModelGateway, modelId } from '../../src/model.ts'
import { fixtureProvider, textReply, toolReply } from '../provider-fixture.ts'
import { createApplication } from '../../src/application.ts'
import { setSourceBinding } from '../../src/workspace/source.ts'

test('沙箱代码直接执行，真实失败回灌模型并可修正，不产生审批挂起', { skip: process.platform !== 'darwin', timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-execution-tool-'))
  const filesystem = new LocalFilesystem({ basePath: join(root, 'task'), contained: true })
  await filesystem.init()
  let resolved = 0
  const fixture = fixtureProvider(request => {
    const toolResults = request.messages.filter(message => message.role === 'tool')
    if (!toolResults.length) return toolReply('run_code', { language: 'node', code: "console.error('REAL_FAILURE'); process.exitCode=7" })
    if (toolResults.length === 1) {
      assert.match(JSON.stringify(toolResults), /REAL_FAILURE/)
      assert.match(JSON.stringify(toolResults), /退出码 7/)
      return toolReply('run_code', { language: 'node', code: "import fs from 'node:fs'; fs.writeFileSync('result.txt','CORRECTED'); console.log('CORRECTED')" }, 'call-2')
    }
    assert.match(JSON.stringify(toolResults), /CORRECTED/)
    return textReply('已修正并生成结果')
  })
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch }
  const storage = new LibSQLStore({ id: 'execution-test', url: `file:${join(root, 'mastra.sqlite')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false, workingMemory: { enabled: false } } })
  const agent = new Agent({ id: 'execution', name: 'Execution', instructions: '运行计算并修正错误', model: modelId(settings), memory,
    tools: createExecutionTools(() => { resolved++; return { filesystem } }),
  })
  const mastra = new Mastra({ agents: { execution: agent }, storage, gateways: { lumen: createModelGateway(settings) } })
  try {
    const stream = await agent.stream('计算材料', { memory: { thread: 't', resource: 'p:t' }, maxSteps: 5 })
    const output = await stream.getFullOutput()
    assert.match(output.text, /已修正/)
    assert.equal(resolved, 2)
    assert.equal(await readFile(join(filesystem.basePath, 'result.txt'), 'utf8'), 'CORRECTED')
    assert.equal((await agent.listSuspendedRuns({ threadId: 't', resourceId: 'p:t' })).runs.length, 0)
  } finally { await mastra.shutdown(); await storage.close(); await filesystem.destroy(); await rm(root, { recursive: true, force: true }) }
})

test('正式应用自动执行技能脚本与二进制资源，包只读、显式拒绝生效且重启恢复默认行为', { skip: process.platform !== 'darwin', timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-sandbox-skill-'))
  const skill = join(root, 'skills', 'archive-helper')
  const script = join(skill, 'process.py')
  const sourceSkill = join(root, 'source/.lumen/skills/source-helper')
  const sourceScript = join(sourceSkill, 'process.py')
  let step = 0
  const fixture = fixtureProvider(() => {
    step++
    if (step === 1) return toolReply('install_skill', { path: 'archive-source', scope: 'user' }, 'install-call')
    if (step === 2) return toolReply('run_skill', { name: 'archive-helper' }, 'skill-call')
    if (step === 3) return toolReply('run_code', { language: 'python', code: `import runpy\nrunpy.run_path(${JSON.stringify(script)}, run_name='__main__')` }, 'code-call')
    if (step === 4) return toolReply('run_skill', { name: 'source-helper' }, 'source-skill-call')
    if (step === 5) return toolReply('run_code', { language: 'python', code: `import runpy\nrunpy.run_path(${JSON.stringify(sourceScript)}, run_name='__main__')` }, 'source-code-call')
    if (step === 7) return toolReply('run_code', { language: 'node', code: "import fs from 'node:fs'; fs.writeFileSync('forbidden.txt', 'should-not-run')" }, 'denied-call')
    return textReply('处理完成')
  })
  const options = { dataRoot: root, model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch } }
  let application = await createApplication(options)
  try {
    const session = await application.session('p', 'task')
    await mkdir(sourceSkill, { recursive: true })
    await writeFile(join(sourceSkill, 'SKILL.md'), '---\nname: source-helper\ndescription: 来源技能\n---\n运行 process.py。')
    await writeFile(join(sourceSkill, 'asset.bin'), Buffer.from([255, 128, 0]))
    await writeFile(sourceScript, `from pathlib import Path
asset = Path(__file__).parent / 'asset.bin'
Path('source-result.bin').write_bytes(asset.read_bytes())
try:
    asset.write_bytes(b'changed')
    raise AssertionError('SOURCE_WRITABLE')
except PermissionError:
    pass
print('SOURCE_READONLY')
`)
    await setSourceBinding(join(root, 'projects/p'), join(root, 'source'))
    // -------- 会话建立后安装，验证执行时重新解析技能可读根 --------
    const source = join(root, 'projects/p/tasks/task/archive-source')
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'SKILL.md'), '---\nname: archive-helper\ndescription: 解压本地材料\n---\n运行 process.py。')
    await writeFile(join(source, 'asset.bin'), Buffer.from([0, 1, 128, 255]))
    await writeFile(join(source, 'process.py'), `from pathlib import Path
import zipfile
package = Path(__file__).parent
assert (package / 'asset.bin').read_bytes() == bytes([0, 1, 128, 255])
try:
    (package / 'asset.bin').write_bytes(b'changed')
    raise AssertionError('PACKAGE_WRITABLE')
except PermissionError:
    pass
Path('library').mkdir(exist_ok=True)
with zipfile.ZipFile('library/upload', 'w') as archive:
    archive.writestr('result.txt', 'SANDBOX_UNPACKED')
Path('library/upload').rename('library/archive.zip')
with zipfile.ZipFile('library/archive.zip') as archive:
    archive.extractall('library/extracted')
print('SANDBOX_UNPACKED')
`)
    const approvals: string[] = []
    session.subscribe(event => {
      if (event.type !== 'tool_approval_required') return
      approvals.push(event.toolName)
      session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'decline' })
    })
    await session.sendMessage({ content: '运行已安装的 archive-helper 处理材料' })
    assert.deepEqual(approvals, [])
    assert.equal(session.displayState.get().pendingApproval, null)
    assert.equal(await readFile(join(root, 'projects/p/tasks/task/library/extracted/result.txt'), 'utf8'), 'SANDBOX_UNPACKED')
    assert.deepEqual(await readFile(join(skill, 'asset.bin')), Buffer.from([0, 1, 128, 255]))
    assert.deepEqual(await readFile(join(root, 'projects/p/tasks/task/source-result.bin')), Buffer.from([255, 128, 0]))
    const rules = session.permissions.getRules()
    assert.equal(rules.categories.execute, 'allow')
    assert.notEqual(rules.categories.other, 'allow')
    await session.permissions.setForTool({ toolName: 'run_code', policy: 'deny' })
    await (await application.session('p', 'task')).sendMessage({ content: '拒绝策略生效时不能运行代码' })
    assert.equal(session.permissions.getRules().tools.run_code, 'deny')
    await assert.rejects(access(join(root, 'projects/p/tasks/task/forbidden.txt')))
    await application.close(); application = await createApplication(options)
    const reopened = await application.session('p', 'task')
    assert.equal(reopened.permissions.getRules().categories.execute, 'allow')
    await rename(join(root, 'source'), join(root, 'source-moved'))
    await symlink(join(root, 'source-moved'), join(root, 'source'))
    await assert.rejects(application.skillsFor('p', 'task'), /资料路径已变化/)
  } finally { await application.close(); await rm(root, { recursive: true, force: true }) }
})
