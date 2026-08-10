/**
 * [INPUT]: git CLI；repo 根 + worktree 目标路径
 * [OUTPUT]: materializeWorktree / removeWorktree / resolveGitRoot / expandUserPath
 * [POS]: subagent T5；失败显式 error，禁止 fallback isolation=none
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { SUBAGENT_ERROR } from './types.ts'

export interface WorktreeOk {
  ok: true
  path: string
  /** 可选：add 时分支/detach 标记 */
  ref: string
}

export interface WorktreeErr {
  ok: false
  error_code: typeof SUBAGENT_ERROR.WORKTREE_FAILED
  error: string
}

export type WorktreeResult = WorktreeOk | WorktreeErr

function runGit(args: string[], cwd?: string): { code: number; stdout: string; stderr: string } {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  return {
    code: r.status ?? 1,
    stdout: (r.stdout ?? '').trim(),
    stderr: (r.stderr ?? '').trim() || (r.error ? String(r.error.message) : ''),
  }
}

/** 展开 ~/… */
export function expandUserPath(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2))
  }
  return p
}

/** 从 start 向上找 .git；无则 null（不抛） */
export function resolveGitRoot(start: string | null | undefined): string | null {
  if (!start) return null
  let dir = path.resolve(start)
  for (let i = 0; i < 64; i++) {
    const gitPath = path.join(dir, '.git')
    if (existsSync(gitPath)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * git worktree add --detach <path> HEAD
 * 无 git / 非仓库 / add 失败 → WORKTREE_FAILED（调用方不得改 none）
 */
export function materializeWorktree(opts: {
  repoRoot: string
  worktreePath: string
}): WorktreeResult {
  const repo = path.resolve(opts.repoRoot)
  const target = path.resolve(opts.worktreePath)

  if (!existsSync(path.join(repo, '.git'))) {
    return {
      ok: false,
      error_code: SUBAGENT_ERROR.WORKTREE_FAILED,
      error: `not a git repository: ${repo}`,
    }
  }

  // git 是否可用
  const ver = runGit(['--version'])
  if (ver.code !== 0) {
    return {
      ok: false,
      error_code: SUBAGENT_ERROR.WORKTREE_FAILED,
      error: `git not available: ${ver.stderr || ver.stdout || 'exit ' + ver.code}`,
    }
  }

  mkdirSync(path.dirname(target), { recursive: true })
  if (existsSync(target)) {
    return {
      ok: false,
      error_code: SUBAGENT_ERROR.WORKTREE_FAILED,
      error: `worktree path already exists: ${target}`,
    }
  }

  const add = runGit(['worktree', 'add', '--detach', target, 'HEAD'], repo)
  if (add.code !== 0) {
    // 清理半成品目录（若有）
    try {
      if (existsSync(target)) rmSync(target, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      error_code: SUBAGENT_ERROR.WORKTREE_FAILED,
      error: add.stderr || add.stdout || `git worktree add failed (code ${add.code})`,
    }
  }

  return { ok: true, path: target, ref: 'HEAD' }
}

/** 移除 worktree（测试/清理）；失败不抛 */
export function removeWorktree(opts: { repoRoot: string; worktreePath: string }): boolean {
  const repo = path.resolve(opts.repoRoot)
  const target = path.resolve(opts.worktreePath)
  const r = runGit(['worktree', 'remove', '--force', target], repo)
  if (r.code === 0) return true
  // 兜底：prune + rm
  runGit(['worktree', 'prune'], repo)
  try {
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
    return !existsSync(target)
  } catch {
    return false
  }
}
