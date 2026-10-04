/**
 * [INPUT]: 完整应用 Controller、原生专家委派、Seatbelt 与模型 HTTP 夹具
 * [OUTPUT]: 默认委派/箱内计算无批准步骤，专家读取技能资源但只能写独立产物目录
 * [POS]: 防止测试自动批准所有事件掩盖产品默认权限差异
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApplication } from '../../src/application.ts'
import { fixtureProvider, textReply, toolReply } from '../provider-fixture.ts'

test('通用专家自动委派并在独立沙箱执行，技能资源只读且不能写父任务', { skip: process.platform !== 'darwin', timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-specialist-sandbox-'))
  const skill = join(root, 'projects/p/skills/helper')
  const task = join(root, 'projects/p/tasks/task')
  await mkdir(skill, { recursive: true })
  await writeFile(join(skill, 'SKILL.md'), '---\nname: helper\ndescription: Skill resource\n---\n读取 asset.bin')
  await writeFile(join(skill, 'asset.bin'), Buffer.from([0, 128, 255]))
  const fixture = fixtureProvider(request => {
    const hasResult = request.messages.some(message => message.role === 'tool')
    if (request.tools?.some(tool => tool.function.name === 'agent-reader')) return hasResult
      ? textReply('父研究完成') : toolReply('agent-general-purpose', { prompt: '执行计算', _background: { disposition: 'deferred' } }, 'delegate-code')
    return hasResult ? textReply('执行成功，result.txt 已生成') : toolReply('run_code', { language: 'node', code: `
      import fs from 'node:fs';
      const asset = ${JSON.stringify(join(skill, 'asset.bin'))};
      if (fs.readFileSync(asset).toString('hex') !== '0080ff') throw new Error('MISSING_RESOURCE');
      if (fs.readFileSync(${JSON.stringify(join(task, 'input.txt'))}, 'utf8') !== 'PARENT_INPUT') throw new Error('MISSING_INPUT');
      for (const path of [asset, ${JSON.stringify(join(task, 'outside.txt'))}]) {
        try { fs.writeFileSync(path, 'bad'); throw new Error('ISOLATION_FAILED'); }
        catch (error) { if (!['EPERM','EACCES'].includes(error.code)) throw error; }
      }
      fs.writeFileSync('result.txt', 'SANDBOX_EXECUTION'); console.log('SANDBOX_EXECUTION');
    ` }, 'code-call')
  })
  const application = await createApplication({ dataRoot: root,
    model: { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'test', fetch: fixture.fetch },
  })
  try {
    const session = await application.session('p', 'task')
    await mkdir(task, { recursive: true })
    await writeFile(join(task, 'input.txt'), 'PARENT_INPUT')
    const approvals: string[] = []
    session.subscribe(event => {
      if (event.type !== 'tool_approval_required') return
      approvals.push(event.toolName)
      session.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'decline' })
    })
    await session.sendMessage({ content: '委派专家计算' })
    assert.equal(approvals.length, 0, JSON.stringify(approvals))
    assert.equal(session.displayState.get().pendingApproval, null)
    const directories = await readdir(join(task, 'workers'))
    assert.equal(directories.length, 1)
    assert.equal(await readFile(join(task, 'workers', directories[0]!, 'result.txt'), 'utf8'), 'SANDBOX_EXECUTION')
    await assert.rejects(access(join(task, 'outside.txt')))
    assert.deepEqual(await readFile(join(skill, 'asset.bin')), Buffer.from([0, 128, 255]))
    assert.match(JSON.stringify(await application.memory.recall({ threadId: 'p:task', resourceId: 'p:task' })), /父研究完成/)
    // -------- 父任务的明确拒绝不能经另一次专家委派绕过 --------
    const denied = await application.session('p', 'denied')
    await denied.permissions.setForTool({ toolName: 'run_code', policy: 'deny' })
    denied.subscribe(event => {
      if (event.type !== 'tool_approval_required') return
      approvals.push(event.toolName)
      denied.respondToToolApproval({ toolCallId: event.toolCallId, decision: 'decline' })
    })
    await denied.sendMessage({ content: '尝试委派执行，但必须遵守父会话禁止代码的设置' })
    assert.equal(approvals.length, 0, JSON.stringify(approvals))
    const deniedWorkers = join(root, 'projects/p/tasks/denied/workers')
    for (const directory of await readdir(deniedWorkers)) {
      await assert.rejects(access(join(deniedWorkers, directory, 'result.txt')))
      await assert.rejects(access(join(deniedWorkers, directory, 'runs')))
    }
  } finally { await application.close(); await rm(root, { recursive: true, force: true }) }
})
