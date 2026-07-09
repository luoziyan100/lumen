/** cache/ = 模型的中间产物(如 extract_pdf 提取文本):只给模型读,不进用户工作目录(2026-07-09 客户定)。 */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../../src/storage/db.ts'
import { TaskStore } from '../../src/storage/task-store.ts'
import { AgentRuntime } from '../../src/runtime/agent-runtime.ts'
import { ENV_TOOLS } from '../../src/tools/env/fs-tools.ts'
import { ScriptedModel } from '../helpers/scripted-model.ts'

test('listAssets 不陈列 cache/(中间产物);readAsset 仍可读', async (t: TestContext) => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-cache-'))
  const db = openDatabase(path.join(base, 'lumen.sqlite'))
  t.after(() => {
    db.close()
    return rm(base, { recursive: true, force: true })
  })
  const rt = new AgentRuntime({
    store: new TaskStore(db),
    model: new ScriptedModel([]),
    sessionDir: path.join(base, 'sessions'),
    workspacesDir: path.join(base, 'workspaces'),
    mainTools: ENV_TOOLS,
  })

  // 会话工作区里:一份用户要的产物 + 一份提取中间产物
  const wsRoot = path.join(base, 'workspaces', 'p', 'sessions', 't1')
  await mkdir(path.join(wsRoot, 'docs'), { recursive: true })
  await mkdir(path.join(wsRoot, 'cache'), { recursive: true })
  await writeFile(path.join(wsRoot, 'docs', '解读报告.md'), '# 报告')
  await writeFile(path.join(wsRoot, 'cache', 'paper-extract.md'), '提取全文……')

  assert.deepEqual(
    (await rt.listAssets('p', 't1')).map((a) => a.path),
    ['docs/解读报告.md'],
    '工作目录只陈列用户要的产物',
  )
  assert.match((await rt.readAsset('p', 'cache/paper-extract.md', 't1')) ?? '', /提取全文/, '模型仍可读 cache/')
})
