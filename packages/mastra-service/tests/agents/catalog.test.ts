/**
 * [INPUT]: 真实临时角色目录、旧 Markdown frontmatter、启停文件和符号链接
 * [OUTPUT]: 分层覆盖、禁用覆盖、能力收窄、原子开关和损坏配置的行为证据
 * [POS]: 自定义角色目录回归；配置加载不执行模型或旧运行时
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, symlink, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAgentCatalog } from '../../src/agents/catalog/registry.ts'
import { parseAgentMarkdown } from '../../src/agents/catalog/parse.ts'
import { readAgentToggles, setAgentDisabled } from '../../src/agents/catalog/toggles.ts'

test('角色层级覆盖与启停沿旧格式，工具及步数只能收窄', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-agent-catalog-'))
  const roots = { userAgentsDir: join(root, 'user'), workspaceAgentsDir: join(root, 'workspace'), projectAgentsDir: join(root, 'project'), pluginAgentsDir: join(root, 'plugin') }
  const togglesPath = join(root, 'subagent-toggles.json')
  try {
    await Promise.all(Object.values(roots).map(path => mkdir(path)))
    const definition = (name: string, body: string, extra = '') => `---\nname: ${name}\ndefault_capability: all\nkind_preset: general-purpose\n${extra}\n---\n${body}`
    await writeFile(join(roots.userAgentsDir, 'reader.md'), definition('reader', 'USER_READER'))
    let catalog = await loadAgentCatalog({ roots, togglesPath })
    assert.equal(catalog.entries.find(entry => entry.role.id === 'reader')?.layer, 'builtin')
    for (const [key, body] of [['pluginAgentsDir', 'PLUGIN'], ['userAgentsDir', 'USER'], ['workspaceAgentsDir', 'WORKSPACE'], ['projectAgentsDir', 'PROJECT']] as const) {
      await writeFile(join(roots[key], 'scout.md'), definition('scout', body, 'disabled: true'))
    }
    await writeFile(join(roots.workspaceAgentsDir, 'reader.md'), definition('reader', 'WORKSPACE_READER', 'max_steps: 100\ntools: read_file, write_file, run_code, ask_user, task_write\nallow_nested: true\nisolation: worktree'))
    await setAgentDisabled(togglesPath, 'scout', false)
    catalog = await loadAgentCatalog({ roots, togglesPath })
    const scout = catalog.entries.find(entry => entry.role.id === 'scout')!
    assert.equal(scout.layer, 'project'); assert.equal(scout.role.instructions, 'PROJECT'); assert.equal(scout.disabled, false)
    const reader = catalog.roles.find(role => role.id === 'reader')!
    assert.equal(reader.instructions, 'WORKSPACE_READER'); assert.equal(reader.writable, false); assert.equal(reader.execute, false)
    assert.equal(reader.maxSteps, 12); assert.deepEqual(reader.tools, ['read_file'])
    assert.ok(catalog.diagnostics.some(item => item.message.includes('worktree')))
    assert.ok(catalog.diagnostics.some(item => item.message.includes('allow_nested')))
    await Promise.all([setAgentDisabled(togglesPath, 'scout', true), setAgentDisabled(togglesPath, 'reader', true)])
    assert.equal((await readAgentToggles(togglesPath)).scout, true)
    assert.equal((await readAgentToggles(togglesPath)).reader, true)
    assert.equal((await stat(togglesPath)).mode & 0o777, 0o600)
    assert.ok(catalog.roles.some(role => role.id === 'scout'), '已加载的快照不被磁盘修改')
    assert.ok(!(await loadAgentCatalog({ roots, togglesPath })).roles.some(role => role.id === 'scout'))
    await writeFile(togglesPath, '{broken')
    await assert.rejects(loadAgentCatalog({ roots, togglesPath }), SyntaxError)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('AGENT.md 与 BOM/CRLF 可读取，越界链接与损坏定义产生诊断', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lumen-agent-files-'))
  const userAgentsDir = join(root, 'user'), workspaceAgentsDir = join(root, 'workspace')
  try {
    await mkdir(join(userAgentsDir, 'custom-scout'), { recursive: true })
    await writeFile(join(userAgentsDir, 'custom-scout', 'AGENT.md'), '\uFEFF---\r\nname: Custom_Scout\r\nmax_steps: 3.8\r\ntools: read_file, grep\r\n---\r\n读取证据')
    await writeFile(join(root, 'outside.md'), '---\nname: leaked\n---\n外部配置')
    await symlink(join(root, 'outside.md'), join(userAgentsDir, 'escape.md'))
    await mkdir(join(userAgentsDir, 'escape-package'))
    await symlink(join(root, 'outside.md'), join(userAgentsDir, 'escape-package', 'AGENT.md'))
    await writeFile(join(userAgentsDir, 'invalid.md'), '---\nname: ../../escape\n---\nINVALID')
    const catalog = await loadAgentCatalog({ roots: { userAgentsDir, workspaceAgentsDir }, togglesPath: join(root, 'toggles.json') })
    assert.deepEqual(catalog.roles.find(role => role.id === 'custom-scout')?.tools, ['read_file', 'grep'])
    assert.equal(catalog.roles.find(role => role.id === 'custom-scout')?.maxSteps, 3)
    assert.ok(!catalog.roles.some(role => role.id === 'leaked'))
    assert.equal(catalog.diagnostics.length, 3)
    assert.throws(() => parseAgentMarkdown('---\nmax_steps: Infinity\n---\nBODY', 'bad'))
    assert.throws(() => parseAgentMarkdown('---\nname: malformed', 'bad'))
    assert.throws(() => parseAgentMarkdown('x'.repeat(80001), 'bad'))
  } finally { await rm(root, { recursive: true, force: true }) }
})
