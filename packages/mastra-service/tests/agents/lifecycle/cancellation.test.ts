/**
 * [INPUT]: 真实 Memory/LibSQL 中同父run的多个原生挂起与workflow快照
 * [OUTPUT]: 显式继续只取消目标invocation，保留其它审批、共享父快照和已完成结果
 * [POS]: 验证旧委派清理边界，不调用模型或重新执行工具
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import type { MastraDBMessage } from '@mastra/core/agent'
import { cancelPriorDelegations } from '../../../src/agents/resume/cancellation.ts'

test('同角色同父run不同调用只取消目标，另一审批及共享父快照仍可恢复', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-cancel-isolation-'))
  const storage = new LibSQLStore({ id: 'cancel-test', url: `file:${join(root, 'memory.db')}` })
  const memory = new Memory({ storage, options: { semanticRecall: false } })
  await storage.init()
  try {
    await memory.createThread({ threadId: 'parent', resourceId: 'parent' })
    const message = (id: string, runId: string, child: string, state: 'call' | 'result' = 'call'): MastraDBMessage => ({
      id, threadId: 'parent', resourceId: 'parent', role: 'assistant', createdAt: new Date(),
      content: { format: 2, parts: [{ type: 'tool-invocation', toolInvocation: { toolCallId: id, toolName: 'agent-reader', args: {}, state, ...(state === 'result' ? { result: 'ALREADY_COMPLETED' } : {}) } }],
        metadata: { pendingToolApprovals: { [id]: { toolCallId: id, toolName: 'agent-reader', runId, delegatedRunId: child } } } },
    })
    await memory.saveMessages({ messages: [message('chosen', 'shared', 'child-a'), message('keep', 'shared', 'child-b'), message('done', 'done-run', 'done-child', 'result')] })
    const workflows = (await storage.getStore('workflows'))!
    for (const runId of ['shared', 'child-a', 'child-b', 'done-run', 'done-child']) await workflows.persistWorkflowSnapshot({ workflowName: 'agent-loop', runId, resourceId: 'parent', snapshot: {
      runId, status: 'suspended', value: {}, context: {}, serializedStepGraph: [], activePaths: [], activeStepsPath: {}, suspendedPaths: {}, resumeLabels: {}, waitingPaths: {}, timestamp: Date.now(),
    } })
    await cancelPriorDelegations(memory, storage, 'parent', new Set(['agent-reader']), 'shared:chosen')
    const { messages } = await memory.recall({ threadId: 'parent', resourceId: 'parent', perPage: 100 })
    const chosen = messages.find(item => item.id === 'chosen')!, keep = messages.find(item => item.id === 'keep')!
    assert.equal(chosen.content.metadata?.pendingToolApprovals, undefined)
    assert.equal(chosen.content.parts[0]?.type === 'tool-invocation' && chosen.content.parts[0].toolInvocation.state, 'output-error')
    assert.ok(keep.content.metadata?.pendingToolApprovals)
    for (const runId of ['shared', 'child-b']) assert.equal((await workflows.loadWorkflowSnapshot({ workflowName: 'agent-loop', runId }))?.status, 'suspended')
    assert.equal((await workflows.loadWorkflowSnapshot({ workflowName: 'agent-loop', runId: 'child-a' }))?.status, 'canceled')
    await cancelPriorDelegations(memory, storage, 'parent', new Set(['agent-reader']))
    const after = await memory.recall({ threadId: 'parent', resourceId: 'parent', perPage: 100 })
    const done = after.messages.find(item => item.id === 'done')!.content.parts[0]!
    assert.equal(done.type === 'tool-invocation' && done.toolInvocation.state, 'result')
    assert.equal(done.type === 'tool-invocation' && 'result' in done.toolInvocation && done.toolInvocation.result, 'ALREADY_COMPLETED')
  } finally { await storage.close(); await rm(root, { recursive: true, force: true }) }
})
