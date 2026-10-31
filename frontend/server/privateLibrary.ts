import { readFile, realpath, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { resolve, relative, extname } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const directory = resolve(import.meta.dirname, '../../private-content')
type Asset = { id: string; path: string; name: string; type: string; label: string }
type Catalog = { assets: Asset[]; archiveAssets?: Asset[]; books: unknown[] }

export function byteRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2]) || size < 1) return null
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size || (!match[1] && Number(match[2]) < 1)) return null
  start = Math.min(start, size - 1)
  return { start, end }
}

export function trustedLocalRequest(request: IncomingMessage): boolean {
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(request.headers.host ?? '')) return false
  const address = request.socket.remoteAddress
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '')) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  if (request.headers.origin) {
    try { return new URL(request.headers.origin).host === request.headers.host } catch { return false }
  }
  return true
}

async function serve(request: IncomingMessage, response: ServerResponse, next: () => void) {
  const route = request.url?.split('?')[0] ?? ''
  if (!route.startsWith('/api/private/')) { next(); return }
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  const json = (status: number, value: unknown) => {
    response.statusCode = status
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(value))
  }
  if (!trustedLocalRequest(request)) { json(403, { error: 'Private library is available only from this computer.' }); return }
  if (request.method !== 'GET' && request.method !== 'HEAD') { json(405, { error: 'Read-only library' }); return }
  try {
    const catalog: Catalog = JSON.parse(await readFile(resolve(directory, 'catalog.local.json'), 'utf8'))
    if (route === '/api/private/library') {
      json(200, { books: catalog.books, assets: catalog.assets.map(({ path: _path, ...asset }) => asset) })
      return
    }
    const page = route.match(/^\/api\/private\/books\/([a-f0-9]{64})\/pages\/(\d+)$/)
    if (page) {
      const document = JSON.parse(await readFile(resolve(directory, 'pages', page[1] + '.local.json'), 'utf8'))
      const entry = document.pages[Number(page[2]) - 1]
      if (!entry) { json(404, { error: 'Page unavailable' }); return }
      json(200, entry)
      return
    }
    const match = route.match(/^\/api\/private\/assets\/([a-f0-9]{64})$/)
    const asset = match && [...catalog.assets, ...(catalog.archiveAssets ?? [])].find(item => item.id === match[1])
    if (!asset) { json(404, { error: 'Asset unavailable' }); return }
    const actual = await realpath(asset.path)
    const inside = relative(await realpath(directory), actual)
    if (inside.startsWith('..') || resolve(directory, inside) !== actual) { json(403, { error: 'Asset outside private library' }); return }
    const metadata = await stat(actual)
    if (!metadata.isFile()) { json(404, { error: 'Asset unavailable' }); return }
    let start = 0, end = metadata.size - 1
    if (request.headers.range) {
      const range = byteRange(request.headers.range, metadata.size)
      if (!range) { response.setHeader('Content-Range', `bytes */${metadata.size}`); json(416, { error: 'Invalid byte range' }); return }
      start = range.start; end = range.end
      response.statusCode = 206
      response.setHeader('Content-Range', `bytes ${start}-${end}/${metadata.size}`)
    }
    const mime = { '.pdf': 'application/pdf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4' }[extname(actual)]
    response.setHeader('Content-Type', mime ?? 'application/octet-stream')
    response.setHeader('Accept-Ranges', 'bytes')
    response.setHeader('Content-Length', end - start + 1)
    if (request.method === 'HEAD') { response.end(); return }
    const stream = createReadStream(actual, { start, end })
    stream.on('error', () => response.destroy())
    response.on('close', () => stream.destroy())
    stream.pipe(response)
  } catch {
    json(503, { error: 'Private library unavailable. Run the local import command to connect your books.' })
  }
}

export default function privateLibrary(): Plugin {
  return {
    name: 'practice-room-private-library',
    configureServer(server) { server.middlewares.use((request, response, next) => { void serve(request, response, next) }) },
    configurePreviewServer(server) { server.middlewares.use((request, response, next) => { void serve(request, response, next) }) },
    resolveId(source) {
      if (/(^|[/\\])private-content([/\\]|$)/.test(source)) throw Error('Private study content must not enter the frontend build')
    },
    generateBundle(_options, bundle) {
      for (const filename of Object.keys(bundle)) {
        if (/\.(pdf|mp3|wav|m4a)$/i.test(filename)) throw Error('Private document/audio assets must be served locally, not published')
      }
    },
  }
}
