/**
 * [INPUT]: node:http and node:fs; the files of packages/ui-client (music.html from music-page.mts, the recordings in src/mastra/studio/objects/music/samples/)
 * [OUTPUT]: serveMusic() → { url, close } (a static server on 127.0.0.1, rooted at packages/ui-client, on the first free port of 5206–5209); run directly, it serves and opens the
 *           music page with the sound switch on, until Ctrl-C
 * [POS]: the listening entry and the evidence's page host, not shipped. The page fetches its recordings, which a file:// page may not, so music-audio.mts and the owner's listening both go
 *        through this server. Usage: node --experimental-strip-types scripts/objects/music-serve.mts (prints the URL and opens it)
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { extname, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const PORTS = [5206, 5207, 5208, 5209]
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.m4a': 'audio/mp4', '.md': 'text/markdown; charset=utf-8' }

const listen = (server: Server, port: number) => new Promise<boolean>(resolve => {
  server.once('error', () => resolve(false))
  server.listen(port, '127.0.0.1', () => resolve(true))
})

export async function serveMusic() {
  const server = createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)).replace(/^[/\\]+/, '')
    if (path.split(sep).includes('..')) { response.writeHead(403).end(); return }
    try {
      const body = await readFile(ROOT + path)
      response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body)
    } catch { response.writeHead(404).end() }
  })
  for (const port of PORTS) {
    if (await listen(server, port)) return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>(resolve => server.close(() => resolve())) }
  }
  throw new Error(`no free port in ${PORTS.join(', ')}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await serveMusic()
  const page = `${url}/scripts/objects/music.html?sound`
  console.log(`music page: ${page}  (Ctrl-C to stop)`)
  execFile('open', [page])
}
