/**
 * Skills:解析 / 发现优先级 / catalog / activate 回灌契约;坏名拒绝。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import {
  activateSkill,
  buildDiscoverRoots,
  discoverSkills,
  formatSkillCatalog,
  parseSkillMarkdown,
  applySkillSubstitutions,
  normalizeSkillName,
} from '../../src/skills/index.ts'

async function writeSkill(root: string, name: string, md: string): Promise<void> {
  const dir = path.join(root, name)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'SKILL.md'), md, 'utf8')
}

test('parseSkillMarkdown:frontmatter + 缺省 description 取首行', () => {
  const r = parseSkillMarkdown(
    `---
name: demo-flow
description: 做一件研究小事
when-to-use: 用户要跑探针流程
---

# Demo
step one
`,
    { dirName: 'demo-flow' },
  )
  assert.ok(!('error' in r))
  if ('error' in r) return
  assert.equal(r.meta.name, 'demo-flow')
  assert.equal(r.meta.description, '做一件研究小事')
  assert.equal(r.meta.whenToUse, '用户要跑探针流程')
  assert.ok(r.body.includes('step one'))
})

test('normalizeSkillName 拒绝路径穿越', () => {
  assert.equal(normalizeSkillName('../x'), null)
  assert.equal(normalizeSkillName('ok-skill'), 'ok-skill')
})

test('applySkillSubstitutions 替换目录与参数', () => {
  const out = applySkillSubstitutions(
    'dir=${LUMEN_SKILL_DIR} args=$ARGUMENTS a0=$0',
    { baseDir: '/tmp/s', args: 'alpha beta' },
  )
  assert.equal(out, 'dir=/tmp/s args=alpha beta a0=alpha')
})

test('discoverSkills:source 覆盖 workspace 覆盖 user', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-sk-'))
  try {
    const user = path.join(base, 'user-skills')
    const ws = path.join(base, 'ws-skills')
    const src = path.join(base, 'src-skills')
    await writeSkill(user, 'probe', `---\nname: probe\ndescription: from-user\n---\nuser body\n`)
    await writeSkill(ws, 'probe', `---\nname: probe\ndescription: from-workspace\n---\nws body\n`)
    await writeSkill(src, 'probe', `---\nname: probe\ndescription: from-source\n---\nsource body\n`)
    await writeSkill(user, 'only-user', `---\nname: only-user\ndescription: u\n---\nx\n`)

    const skills = discoverSkills({
      userSkillsDir: user,
      workspaceSkillsDir: ws,
      sourceSkillsDir: src,
    })
    const probe = skills.find((s) => s.name === 'probe')
    assert.ok(probe)
    assert.equal(probe!.description, 'from-source')
    assert.equal(probe!.layer, 'source')
    assert.ok(skills.some((s) => s.name === 'only-user'))
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('formatSkillCatalog 空则空串;有则含可运行标题', async () => {
  assert.equal(formatSkillCatalog([]), '')
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-skc-'))
  try {
    await writeSkill(base, 'a', `---\nname: a\ndescription: A flow\n---\nbody\n`)
    const skills = discoverSkills({
      userSkillsDir: base,
      workspaceSkillsDir: path.join(base, 'missing-ws'),
      sourceSkillsDir: null,
    })
    const cat = formatSkillCatalog(skills)
    assert.ok(cat.includes('可运行的 Skills'))
    assert.ok(cat.includes('run_skill'))
    assert.ok(cat.includes('a: A flow'))
    assert.ok(!cat.includes('跨会话记忆'))
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('activateSkill 回灌契约含 Skill activated 与替换后路径', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'lumen-ska-'))
  try {
    await writeSkill(
      base,
      'flow',
      `---\nname: flow\ndescription: F\n---\nRun \${LUMEN_SKILL_DIR}/scripts/x.py with $ARGUMENTS\n`,
    )
    const skills = discoverSkills({
      userSkillsDir: base,
      workspaceSkillsDir: path.join(base, 'no'),
      sourceSkillsDir: null,
    })
    const r = activateSkill(skills, 'flow', 'arg1')
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.ok(r.llmContent.startsWith('Skill activated: flow'))
    assert.ok(r.llmContent.includes('running playbook'))
    assert.ok(r.llmContent.includes(`${r.pkg.baseDir}/scripts/x.py`))
    assert.ok(r.llmContent.includes('arg1'))
    assert.ok(!r.llmContent.includes('已读取'))
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('activateSkill 未知名 → 错误回灌', () => {
  const r = activateSkill([], 'nope')
  assert.equal(r.ok, false)
  assert.ok(r.llmContent.includes('error:'))
})

test('buildDiscoverRoots 拼三层路径', () => {
  const roots = buildDiscoverRoots({
    workspacesDir: '/w',
    projectId: 'p1',
    sourcePath: '/repo',
    userSkillsDir: '/home/.lumen/skills',
  })
  assert.equal(roots.userSkillsDir, '/home/.lumen/skills')
  assert.equal(roots.workspaceSkillsDir, '/w/p1/skills')
  assert.equal(roots.sourceSkillsDir, '/repo/.lumen/skills')
})
