/**
 * [INPUT]: skills install/uninstall/discover
 * [OUTPUT]: node:test —— 安装/卸载/包装契约
 * [POS]: skills/ 安装面回归
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { discoverSkills, installSkillFromPath, uninstallSkill } from '../../src/skills/index.ts'

async function tmpBase(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'lumen-sk-ins-'))
}

test('installSkillFromPath:目录含 SKILL.md → user 根', async () => {
  const base = await tmpBase()
  try {
    const src = path.join(base, 'src-skill')
    await mkdir(src)
    await writeFile(
      path.join(src, 'SKILL.md'),
      `---
name: paper-read
description: 读论文
---
step 1
`,
      'utf8',
    )
    const userRoot = path.join(base, 'user-skills')
    const r = installSkillFromPath({
      scope: 'user',
      path: src,
      workspacesDir: path.join(base, 'ws'),
      projectId: 'p1',
      userSkillsDir: userRoot,
    })
    assert.equal(r.name, 'paper-read')
    assert.equal(r.layer, 'user')
    const body = await readFile(path.join(userRoot, 'paper-read', 'SKILL.md'), 'utf8')
    assert.match(body, /step 1/)
    const found = discoverSkills({
      userSkillsDir: userRoot,
      workspaceSkillsDir: path.join(base, 'ws', 'p1', 'skills'),
    })
    assert.ok(found.some((s) => s.name === 'paper-read'))
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('installSkillFromPath:单 SKILL.md 包装进目录', async () => {
  const base = await tmpBase()
  try {
    const file = path.join(base, 'SKILL.md')
    await writeFile(
      file,
      `---
name: solo-pack
description: 单文件
---
hello
`,
      'utf8',
    )
    const userRoot = path.join(base, 'user-skills')
    const r = installSkillFromPath({
      scope: 'user',
      path: file,
      workspacesDir: path.join(base, 'ws'),
      projectId: 'p1',
      userSkillsDir: userRoot,
    })
    assert.equal(r.name, 'solo-pack')
    assert.ok((await readFile(path.join(userRoot, 'solo-pack', 'SKILL.md'), 'utf8')).includes('hello'))
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('installSkillFromPath:无 SKILL.md 的目录拒绝', async () => {
  const base = await tmpBase()
  try {
    const src = path.join(base, 'empty')
    await mkdir(src)
    assert.throws(
      () => installSkillFromPath({
        scope: 'user',
        path: src,
        workspacesDir: path.join(base, 'ws'),
        projectId: 'p',
        userSkillsDir: path.join(base, 'u'),
      }),
      /SKILL\.md/,
    )
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test('uninstallSkill:删 user 包', async () => {
  const base = await tmpBase()
  try {
    const userRoot = path.join(base, 'user-skills')
    const src = path.join(base, 'src')
    await mkdir(src)
    await writeFile(path.join(src, 'SKILL.md'), '---\nname: doomed\ndescription: x\n---\n', 'utf8')
    installSkillFromPath({
      scope: 'user',
      path: src,
      workspacesDir: path.join(base, 'ws'),
      projectId: 'p',
      userSkillsDir: userRoot,
    })
    uninstallSkill({
      scope: 'user',
      name: 'doomed',
      workspacesDir: path.join(base, 'ws'),
      projectId: 'p',
      userSkillsDir: userRoot,
    })
    const found = discoverSkills({
      userSkillsDir: userRoot,
      workspaceSkillsDir: path.join(base, 'ws', 'p', 'skills'),
    })
    assert.ok(!found.some((s) => s.name === 'doomed'))
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})
