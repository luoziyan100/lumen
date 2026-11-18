/**
 * [INPUT]: node:child_process execFileSync (lsof)
 * [OUTPUT]: assertRoot(defaultRoot) returns LUMEN_ASSERT_ROOT or the default, refusing anything outside /tmp/lumen-*; assertPortFree(port) throws when something already listens there
 * [POS]: scripts/sprite shared guard for the suites that wipe a fixture root and start their own vite (sediment, reading, objects)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { execFileSync } from 'node:child_process'

// Each suite wipes its root at start; a shared root lets one run (or a --hold) destroy another's data.
export function assertRoot(defaultRoot: string): string {
  const root = process.env.LUMEN_ASSERT_ROOT ?? defaultRoot
  if (!root.startsWith('/tmp/lumen-')) throw new Error(`isolated root under /tmp/lumen-* required, got ${root}`)
  return root
}

// vite --strictPort only fails once it binds; by then a stale server on the port has already answered
// the readiness probe and the pages would talk to that server's fixture (seen on 5190/5192, 2026-11-17).
export function assertPortFree(port: string): void {
  let pids = ''
  try {
    pids = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim()
  } catch (error) {
    // lsof exits 1 when nothing matches; anything else means we could not check
    if ((error as { status?: number }).status !== 1) throw new Error(`could not check port ${port} with lsof: ${String(error)}`)
  }
  if (pids) throw new Error(`port ${port} is already in use (pid ${pids.split('\n').join(', ')}); stop that server or set PORT to a free port`)
}
