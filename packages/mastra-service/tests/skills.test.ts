/**
 * [INPUT]: 临时工作区、真实技能目录、Mastra Agent 与模型 HTTP 夹具
 * [OUTPUT]: 技能发现/激活/安装/资源读取的功能与文件边界证据
 * [POS]: 新技能服务回归验证；正式用户目录与网络安装不参与测试
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core/mastra'
import { createSkillRegistry, createSkillTools, parseSkillMarkdown, applySkillSubstitutions } from '../src/skills/index.ts'
import { createModelGateway, modelId } from '../src/model.ts'
import { fixtureProvider, textReply, toolReply } from './provider-fixture.ts'

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'lumen-skills-'))
  const workspaceDir = join(root, 'workspace')
  const roots = { userSkillsDir: join(root, 'user'), projectSkillsDir: join(root, 'project'), sourceSkillsDir: join(root, 'source') }
  await mkdir(workspaceDir)
  return { root, workspaceDir, roots, registry: createSkillRegistry({ workspaceDir, roots }), close: () => rm(root, { recursive: true, force: true }) }
}

async function skill(root: string, name: string, body: string, metadata = '') {
  const directory = join(root, name)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'SKILL.md'), `---\nname: ${name}\n${metadata}\n---\n${body}`)
  return directory
}

test('解析多行描述与旧字段；用户参数只插值一次', () => {
  const parsed = parseSkillMarkdown('---\nname: Research_Flow\ndescription: >\n  Compare sources\n  and evidence.\nwhen_to_use: research\ndisable-model-invocation: true\n---\n$ARGUMENTS $0 ${SKILL_DIR}', 'unused')
  assert.equal(parsed.meta.name, 'research-flow')
  assert.equal(parsed.meta.description, 'Compare sources and evidence.')
  assert.equal(parsed.meta.whenToUse, 'research')
  assert.equal(parsed.meta.disableModelInvocation, true)
  assert.equal(applySkillSubstitutions(parsed.body, { baseDir: '/safe/$0', args: '$1 ${SKILL_DIR}' }).trim(), '$1 ${SKILL_DIR} $1 /safe/$0')
  assert.throws(() => parseSkillMarkdown('---\nname: ../bad\n---\nbody', 'unused'), /非法/)
  assert.throws(() => parseSkillMarkdown('---\nname: bad', 'unused'), /结束分隔符/)
})

test('实时发现按 source/project/user 覆盖；禁用模型目录的技能仍可显式激活', async () => {
  const env = await setup()
  try {
    await skill(env.roots.userSkillsDir, 'compare', 'user evidence')
    await skill(env.roots.projectSkillsDir, 'compare', 'project evidence')
    await skill(env.roots.sourceSkillsDir, 'compare', 'source $ARGUMENTS')
    await skill(env.roots.userSkillsDir, 'manual-only', 'manual evidence', 'disable-model-invocation: true')
    const discovered = await env.registry.list()
    assert.equal(discovered.find(item => item.name === 'compare')?.layer, 'source')
    assert.match((await env.registry.activate('compare', 'papers')).content, /source papers/)
    assert.doesNotMatch(await env.registry.catalog(), /manual-only/)
    assert.match((await env.registry.activate('manual-only')).content, /manual evidence/)
    await rm(join(env.roots.sourceSkillsDir, 'compare'), { recursive: true })
    assert.match((await env.registry.activate('compare')).content, /project evidence/)
    await assert.rejects(env.registry.activate('missing'), /未知/)
  } finally { await env.close() }
})

test('发现与包内资源读取拒绝越界目录、正文和资源符号链接', async () => {
  const env = await setup()
  try {
    const external = await skill(join(env.root, 'outside'), 'escape', 'private text')
    const local = await skill(env.roots.userSkillsDir, 'safe', 'read notes.md')
    await writeFile(join(local, 'notes.md'), 'local notes')
    await symlink(external, join(env.roots.userSkillsDir, 'escaped-directory'))
    await mkdir(join(env.roots.userSkillsDir, 'escaped-file'))
    await symlink(join(external, 'SKILL.md'), join(env.roots.userSkillsDir, 'escaped-file/SKILL.md'))
    await symlink(join(external, 'SKILL.md'), join(local, 'linked.md'))
    assert.deepEqual((await env.registry.list()).map(item => item.name), ['safe'])
    assert.equal((await env.registry.readFile('safe', 'notes.md')).content, 'local notes')
    await assert.rejects(env.registry.readFile('safe', 'linked.md'), /越界/)
    await assert.rejects(env.registry.readFile('safe', '../../outside/escape/SKILL.md'), /越界/)
    await assert.rejects(env.registry.readFile('safe', '/etc/passwd'), /相对路径/)
  } finally { await env.close() }
})

test('安装真实目录保留脚本执行位；单 Markdown 的名字不再取临时目录名', async () => {
  const env = await setup()
  try {
    const source = await skill(env.workspaceDir, 'compare', 'compare evidence')
    await mkdir(join(source, 'scripts'))
    await writeFile(join(source, 'scripts/read.py'), 'print("evidence")\n')
    await chmod(join(source, 'scripts/read.py'), 0o755)
    const installed = await env.registry.install({ path: 'compare', scope: 'project' })
    assert.equal(installed.layer, 'project')
    assert.match((await env.registry.readFile('compare', 'scripts/read.py')).content, /evidence/)
    assert.equal((await stat(join(installed.baseDir, 'scripts/read.py'))).mode & 0o100, 0o100)
    await writeFile(join(env.workspaceDir, 'summary.md'), '# Summary\nSummarize papers.\n')
    assert.equal((await env.registry.install({ path: 'summary.md' })).name, 'summary')
    await mkdir(join(env.workspaceDir, 'review'))
    await writeFile(join(env.workspaceDir, 'review/SKILL.md'), '# Review\nReview the paper.\n')
    assert.equal((await env.registry.install({ path: 'review/SKILL.md' })).name, 'review')
    assert.match((await env.registry.activate('summary')).content, /Summarize papers/)
    await env.registry.uninstall({ name: 'summary', scope: 'user' })
    await assert.rejects(env.registry.activate('summary'), /未知/)
  } finally { await env.close() }
})

test('安装来源限制在任务工作区；失败覆盖保留旧版本和外部文件', async () => {
  const env = await setup()
  try {
    const source = await skill(env.workspaceDir, 'compare', 'stable version')
    const original = await env.registry.install({ path: 'compare' })
    const outside = await skill(join(env.root, 'outside'), 'external', 'private evidence')
    await symlink(outside, join(env.workspaceDir, 'escape'))
    await assert.rejects(env.registry.install({ path: 'escape' }), /越界/)
    await assert.rejects(env.registry.install({ path: '../outside/external' }), /越界/)
    await assert.rejects(env.registry.install({ path: outside }), /相对路径/)
    await writeFile(join(source, 'SKILL.md'), '---\nname: compare\n---\nnew version')
    await symlink(join(outside, 'SKILL.md'), join(source, 'reference.md'))
    await assert.rejects(env.registry.install({ path: 'compare' }), /符号链接/)
    assert.match(await readFile(join(original.baseDir, 'SKILL.md'), 'utf8'), /stable version/)
    assert.match(await readFile(join(outside, 'SKILL.md'), 'utf8'), /private evidence/)
    assert.deepEqual(await readdir(env.roots.userSkillsDir), ['compare'])
    await assert.rejects(env.registry.uninstall({ name: '../outside', scope: 'user' }), /非法/)
  } finally { await env.close() }
})

test('同根并发覆盖按次序发布完整包；超长正文拒绝且旧包可用', async () => {
  const env = await setup()
  try {
    await skill(env.workspaceDir, 'a', 'first version', '')
    await skill(env.workspaceDir, 'b', 'second version', '')
    await writeFile(join(env.workspaceDir, 'a/SKILL.md'), '---\nname: target\n---\nfirst version')
    await writeFile(join(env.workspaceDir, 'b/SKILL.md'), '---\nname: target\n---\nsecond version')
    const secondRegistry = createSkillRegistry({ workspaceDir: env.workspaceDir, roots: env.roots })
    await Promise.all([env.registry.install({ path: 'a' }), secondRegistry.install({ path: 'b' })])
    assert.match((await env.registry.activate('target')).content, /(?:first|second) version/)
    await writeFile(join(env.workspaceDir, 'a/SKILL.md'), `---\nname: target\n---\n${'x'.repeat(80_001)}`)
    await assert.rejects(env.registry.install({ path: 'a' }), /字节上限/)
    assert.match((await env.registry.activate('target')).content, /(?:first|second) version/)
    assert.deepEqual(await readdir(env.roots.userSkillsDir), ['target'])
  } finally { await env.close() }
})

test('Mastra 原生安装、激活、读取资源把真实结果回灌下一轮模型', { timeout: 20000 }, async () => {
  const env = await setup()
  const source = await skill(env.workspaceDir, 'evidence', 'Read references.md with $ARGUMENTS')
  await writeFile(join(source, 'references.md'), 'LUMEN-SKILL-EVIDENCE-9')
  let evidenceSeen = false
  const fixture = fixtureProvider(request => {
    const results = request.messages.filter(message => message.role === 'tool')
    if (!results.length) return toolReply('install_skill', { path: 'evidence', scope: 'project' }, 'install')
    if (results.length === 1) return toolReply('run_skill', { name: 'evidence', args: 'papers' }, 'activate')
    if (results.length === 2) {
      assert.match(JSON.stringify(results), /Read references.md with papers/)
      return toolReply('read_skill_file', { name: 'evidence', path: 'references.md' }, 'read-reference')
    }
    evidenceSeen = JSON.stringify(results).includes('LUMEN-SKILL-EVIDENCE-9')
    return textReply('技能资料已读取')
  })
  const settings = { baseURL: 'https://fixture.invalid/v1', apiKey: 'fixture', model: 'skills-test', fetch: fixture.fetch }
  const agent = new Agent({ id: 'skills', name: 'Skills', instructions: 'Use skills', model: modelId(settings), tools: createSkillTools(() => env.registry) })
  const mastra = new Mastra({ agents: { agent }, gateways: { lumen: createModelGateway(settings) } })
  try {
    const output = await agent.generate('安装并执行研究技能', { maxSteps: 5 })
    assert.ok(evidenceSeen, JSON.stringify(fixture.requests))
    assert.match(output.text, /已读取/)
    assert.equal((await env.registry.list())[0]?.name, 'evidence')
  } finally { await mastra.shutdown(); await env.close() }
})
