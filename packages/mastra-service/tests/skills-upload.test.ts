/**
 * [INPUT]: 真实Hono/Mastra服务、临时技能目录及用户所选文件的multipart请求
 * [OUTPUT]: 完整技能包安装/覆盖/激活和桌面文件位置的授权边界验证
 * [POS]: 从产品HTTP进入真实registry与文件系统，确保目录资源不在迁移界面被丢弃
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHttpService } from '../src/server.ts'

const token = 'skill-package-upload-test-token-32-characters'
const headers = { Authorization: `Bearer ${token}` }
const query = 'projectId=p&taskId=t'

function packageForm(files: Array<{ path: string; content: string | Uint8Array; executable?: boolean; directory?: boolean }>) {
  const form = new FormData()
  form.set('manifest', JSON.stringify(files.map(({ path, executable, directory }) => ({ path, executable, directory }))))
  files.forEach(({ content }, index) => form.set(`file-${index}`, new File([typeof content === 'string' ? content : Buffer.from(content)], `entry-${index}`)))
  return form
}

test('技能目录经HTTP完整安装，保留脚本/资源/执行位，非法覆盖不破坏已安装版本', { timeout: 20000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-package-upload-'))
  const service = await createHttpService({ dataRoot, token })
  const json = (path: string, data: unknown) => service.app.request(`/lumen/${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  const upload = (files: Parameters<typeof packageForm>[0], task = 't') => service.app.request(`/lumen/skills/package?projectId=p&taskId=${task}&scope=project`, { method: 'POST', headers, body: packageForm(files) })
  try {
    assert.equal((await json('projects', { id: 'p', name: '研究' })).status, 201)
    assert.equal((await json('sessions', { projectId: 'p', taskId: 't' })).status, 200)
    const files = [
      { path: 'research/SKILL.md', content: '---\nname: research\ndescription: Complete evidence\n---\nRead references/guide.md with $ARGUMENTS' },
      { path: 'research/references/guide.md', content: 'Evidence remains intact.' },
      { path: 'research/scripts/read.py', content: 'print("evidence")\n', executable: true },
      { path: 'research/assets/source.bin', content: new Uint8Array([0, 128, 255]) },
      { path: 'research/output/empty', content: '', directory: true },
    ]
    const installed = await upload(files)
    assert.equal(installed.status, 200, await installed.clone().text())
    assert.equal((await installed.json()).name, 'research')
    const registry = await service.application.skillsFor('p', 't')
    assert.match((await registry.readFile('research', 'references/guide.md')).content, /intact/)
    const skill = (await registry.list()).find(item => item.name === 'research')!
    assert.deepEqual(await readFile(join(skill.baseDir, 'assets/source.bin')), Buffer.from([0, 128, 255]))
    assert.equal((await stat(join(skill.baseDir, 'scripts/read.py'))).mode & 0o100, 0o100)
    assert.equal((await stat(join(skill.baseDir, 'output/empty'))).isDirectory(), true)
    assert.match((await (await json('skills/activate', { projectId: 'p', taskId: 't', name: 'research', args: 'papers' })).json()).content, /with papers/)
    for (const invalid of [
      [...files, { path: 'research/../../escape', content: 'bad' }],
      [...files, { path: 'research/REFERENCES/guide.md', content: 'duplicate' }],
      [{ path: 'research/notes.md', content: 'missing skill' }],
      [...files, { path: 'other/data.md', content: 'other root' }],
    ]) assert.equal((await upload(invalid)).status, 400)
    assert.match((await registry.readFile('research', 'references/guide.md')).content, /intact/)
    const updated = files.map(file => file.path.endsWith('guide.md') ? { ...file, content: 'Updated reference.' } : file)
    assert.equal((await upload(updated)).status, 200)
    assert.match((await registry.readFile('research', 'references/guide.md')).content, /Updated/)
    assert.equal((await upload(files, 'missing')).status, 404)
    assert.equal((await readdir(join(dataRoot, 'projects/p/tasks/t'))).some(name => name.startsWith('.skill-upload-')), false)
    const denied = await service.app.request(`/lumen/skills/package?${query}`, { method: 'POST', body: packageForm(files) })
    assert.equal(denied.status, 401)
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})

test('桌面文件位置只解析已授权会话与根内普通文件，拒绝软链和跨根路径', { timeout: 15000 }, async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'lumen-file-location-'))
  const service = await createHttpService({ dataRoot, token })
  const post = (path: string, body: unknown) => service.app.request(`/lumen/${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  try {
    await post('projects', { id: 'p', name: 'project' }); await post('sessions', { projectId: 'p', taskId: 't' })
    await post('files', { projectId: 'p', taskId: 't', path: 'notes/report.md', content: 'report' })
    const get = (path: string, scope = 'task') => service.app.request(`/lumen/files/location?${query}&scope=${scope}&path=${encodeURIComponent(path)}`, { headers })
    const response = await get('notes/report.md')
    assert.equal(response.status, 200)
    const location = await response.json() as { root: string; path: string }
    assert.equal(await readFile(location.path, 'utf8'), 'report')
    assert.equal(location.path, join(location.root, 'notes/report.md'))
    await writeFile(join(dataRoot, 'private.txt'), 'private')
    await symlink(join(dataRoot, 'private.txt'), join(location.root, 'escaped.md'))
    for (const path of ['escaped.md', '../../../../private.txt', '/etc/passwd', 'notes']) assert.equal((await get(path)).status, 400)
    const unknown = await service.app.request('/lumen/files/location?projectId=other&taskId=t&path=notes/report.md', { headers })
    assert.equal(unknown.status, 404)
  } finally { await service.close(); await rm(dataRoot, { recursive: true, force: true }) }
})
