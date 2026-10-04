/**
 * [INPUT]: 已核对的旧 schema 字段、Node SQLite 与临时文件系统
 * [OUTPUT]: legacyFixture：只含合成研究数据的旧根和隔离目标根
 * [POS]: 数据迁移实验的真实存储输入，无正式凭证或旧包运行依赖
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { removeStaging } from '../../src/migration/files.ts'

export async function legacyFixture() {
  const root = await mkdtemp(join(tmpdir(), 'lumen-migration-'))
  const sourceRoot = join(root, 'old'), targetRoot = join(root, 'new')
  await mkdir(sourceRoot)
  const db = new DatabaseSync(join(sourceRoot, 'lumen.sqlite'))
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA user_version=14;
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, source_path TEXT, created_at TEXT, updated_at TEXT, archived_at TEXT);
    CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT, goal TEXT, title TEXT, status TEXT, created_at TEXT, updated_at TEXT, archived_at TEXT, pinned_at TEXT, active_turn_id TEXT);
    CREATE TABLE task_events (id TEXT PRIMARY KEY, task_id TEXT, seq INTEGER, kind TEXT, payload_json TEXT, agent_role TEXT, created_at TEXT);
    CREATE TABLE unknown_future_table (payload TEXT);
    INSERT INTO unknown_future_table VALUES ('preserve every unknown field');`)
  const created = '2026-08-01T10:00:00.000Z', updated = '2026-08-01T11:00:00.000Z'
  db.prepare('INSERT INTO projects VALUES (?, ?, NULL, ?, ?, ?)').run('p', '历史项目', created, updated, updated)
  db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)').run('task-a', 'p', '研究问题', '旧论文研究', 'done', created, updated, updated, updated)
  let seq = 0
  function event(kind: string, payload: unknown, role: string | null = 'main') {
    const id = `event-${++seq}`
    db.prepare('INSERT INTO task_events VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, 'task-a', seq, kind, JSON.stringify(payload), role, created)
    return id
  }
  event('user', { content: '研究问题', images: [{ mediaType: 'image/png', base64: 'AAAA' }],
    uploads: [{ name: 'a.pdf', path: 'papers/a.pdf', extractPath: 'docs/a.md' }], activePath: 'notes/result.md' })
  event('model_step', { content: '检查材料', reasoningContent: '核对来源', resultSource: 'model_self', operationId: 'model-op',
    toolCalls: [{ id: 'provider-call', name: 'read_file', arguments: { path: 'docs/a.md' } }] })
  event('tool_call', { id: 'provider-call', name: 'read_file', args: { path: 'docs/a.md' }, operationId: 'host-op', parentOperationId: 'model-op', providerCallId: 'provider-call' })
  event('tool_result', { id: 'provider-call', name: 'read_file', llmContent: '论文原文证据', operationId: 'host-op', providerCallId: 'provider-call',
    resultSource: 'external_verification', resultStatus: 'ok', data: { original: '保留来源字段' } })
  event('model_step', { content: '有出处的研究结论', toolCalls: [] })
  event('model_step', { content: '子代理私有推理，不进入父历史', toolCalls: [] }, 'reader')
  event('future_event', { fieldNotKnownToImporter: ['原始数据'] })

  async function file(path: string, content: string | Uint8Array, mode = 0o600) {
    const absolute = join(sourceRoot, path)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, content, { mode })
  }
  await file('workspaces/p/sessions/task-a/papers/a.pdf', new Uint8Array([37, 80, 68, 70, 0, 255]))
  await file('workspaces/p/sessions/task-a/docs/a.md', '论文原文证据')
  await file('workspaces/p/sessions/task-a/notes/result.md', '研究结论')
  await file('workspaces/p/shared/docs/common.md', '共享材料')
  await file('workspaces/p/memory/research.md', '项目长期记忆')
  await file('workspaces/p/skills/review/SKILL.md', '---\nname: review\ndescription: review\n---\n审查论文')
  await file('skills/user-helper/SKILL.md', '---\nname: user-helper\ndescription: helper\n---\n用户技能')
  await file('skills/user-helper/run.sh', '#!/bin/sh\nprintf helper', 0o700)
  await file('sessions/task-a.jsonl', JSON.stringify({ type: 'assistant', task_id: 'task-a', content: '阅读投影不应重复导入' }) + '\n')
  await file('exec-evidence/ab/abcdef', '旧执行证据原文')
  await file('unknown.data', new Uint8Array([0, 17, 128, 255]))
  await file('settings.json', JSON.stringify({ profiles: [{ id: 'provider', provider: 'openai', name: '迁移模型',
    apiKey: 'synthetic-credential', models: ['research'], activeModel: 'research' }], activeProfileId: 'provider', collectExecEvidence: false }))
  return { root, sourceRoot, targetRoot, db, event, file, created, updated,
    async close() { db.close(); await removeStaging(root) } }
}
