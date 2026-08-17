import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_ALLOWED_DOMAINS, hostAllowed, normalizeHost } from '../../src/tools/env/run-code/net-allowlist.ts'

test('hostAllowed:空清单全拒', () => {
  assert.equal(hostAllowed('pypi.org', []), false)
  assert.equal(hostAllowed('127.0.0.1', []), false)
})

test('hostAllowed:精确域 + 子域,大小写不敏感', () => {
  const allow = ['pypi.org', '127.0.0.1']
  assert.equal(hostAllowed('pypi.org', allow), true)
  assert.equal(hostAllowed('PYPI.ORG', allow), true)
  assert.equal(hostAllowed('pypi.org:443', allow), true)
  assert.equal(hostAllowed('files.pypi.org', allow), true)
  assert.equal(hostAllowed('127.0.0.1', allow), true)
  assert.equal(hostAllowed('127.0.0.1:8080', allow), true)
  assert.equal(hostAllowed('evil.example.com', allow), false)
  assert.equal(hostAllowed('notpypi.org', allow), false)
})

test('hostAllowed:显式 *. 与精确域同义', () => {
  assert.equal(hostAllowed('api.crossref.org', ['*.crossref.org']), true)
  assert.equal(hostAllowed('crossref.org', ['*.crossref.org']), true)
  assert.equal(hostAllowed('evil.com', ['*.crossref.org']), false)
})

test('normalizeHost:剥端口与尾点', () => {
  assert.equal(normalizeHost('ArXiv.org:443'), 'arxiv.org')
  assert.equal(normalizeHost('arxiv.org.'), 'arxiv.org')
})

test('DEFAULT_ALLOWED_DOMAINS 含研究起步域', () => {
  for (const d of [
    'pypi.org', 'files.pythonhosted.org', 'registry.npmjs.org',
    'arxiv.org', 'export.arxiv.org', 'api.crossref.org',
    'api.semanticscholar.org', 'doi.org',
  ]) {
    assert.ok(DEFAULT_ALLOWED_DOMAINS.includes(d), d)
  }
})
