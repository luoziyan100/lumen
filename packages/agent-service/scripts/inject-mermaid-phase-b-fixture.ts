/**
 * [INPUT]: TaskStore + mermaidSyntax Phase A
 * [OUTPUT]: 在 ~/.lumen 写入一条置顶会话,图源缺 subgraph end(R* 不补)
 * [POS]: Phase B 手工验收夹具;不进主循环。可重复跑,每次新 task。
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { homedir } from 'node:os'
import * as path from 'node:path'
import { openDatabase } from '../src/storage/db.ts'
import { TaskStore } from '../src/storage/task-store.ts'
import { repairMermaidSyntax } from '../../ui-client/src/mermaidSyntax.ts'

export const PHASE_B_BAD_MEMORY = `flowchart TB
  subgraph mem [记忆层]
    WM["工作记忆"] --> LTM["长期记忆"]
    LTM -.-> WM
`

export function injectPhaseBFixture(): { taskId: string; projectId: string; phaseAActions: string[] } {
  const reply = [
    '这是一张故意缺 `end` 的记忆层图（Phase A 不会猜补 end）。点卡片上的「尝试修复」。',
    '',
    '```mermaid',
    PHASE_B_BAD_MEMORY.trim(),
    '```',
  ].join('\n')

  const phaseA = repairMermaidSyntax(PHASE_B_BAD_MEMORY)
  if (/\bend\b/.test(phaseA.source)) {
    throw new Error('夹具失效:Phase A 已补 end,换一张图')
  }

  const db = openDatabase(path.join(process.env.LUMEN_HOME ?? path.join(homedir(), '.lumen'), 'lumen.sqlite'))
  const store = new TaskStore(db)
  const row = db.prepare(
    'SELECT id FROM projects WHERE archived_at IS NULL ORDER BY created_at LIMIT 1',
  ).get() as { id: string } | undefined
  const projectId = row?.id ?? 'default'
  const task = store.createTask(projectId, 'Phase B 修图验收：缺 end 的记忆层流程图')
  store.updateTaskTitle(task.id, 'Phase B 修图验收')
  store.setTaskPinned(task.id, true)
  store.appendEvent(task.id, 'user', { content: '画一张记忆层流程图。' }, 'main')
  store.appendEvent(task.id, 'reply', { reply }, 'main')
  store.updateTaskStatus(task.id, 'done')
  db.close()
  return { taskId: task.id, projectId, phaseAActions: phaseA.actions }
}

const isMain = process.argv[1]?.includes('inject-mermaid-phase-b-fixture')
if (isMain) {
  console.log(JSON.stringify(injectPhaseBFixture(), null, 2))
}
