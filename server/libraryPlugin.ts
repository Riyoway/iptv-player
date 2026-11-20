import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import { createLibraryStore, isStoredLibrary, type LibraryStore } from './libraryStore'

const ROUTE = '/api/library'
const MAX_BODY_BYTES = 64 * 1024 * 1024

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Library is too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

const handle = async (store: LibraryStore, req: IncomingMessage, res: ServerResponse, url: URL) => {
  // Only pages served by this server may talk to the store; other websites are refused.
  const origin = req.headers.origin
  if (origin && new URL(origin).host !== req.headers.host) return sendJson(res, 403, { error: 'Cross-origin requests are not allowed.' })

  if (req.method === 'GET') {
    const saved = await store.read()
    if (url.searchParams.has('rev')) return sendJson(res, 200, { rev: saved?.rev ?? 0 })
    return sendJson(res, 200, { rev: saved?.rev ?? 0, library: saved?.library ?? null })
  }

  if (req.method === 'PUT') {
    if (!req.headers['content-type']?.includes('application/json')) return sendJson(res, 415, { error: 'Expected application/json.' })
    const body = JSON.parse(await readBody(req)) as { baseRev?: unknown; library?: unknown }
    if (typeof body.baseRev !== 'number' || !isStoredLibrary(body.library)) return sendJson(res, 400, { error: 'Invalid library.' })
    const result = await store.write(body.library, body.baseRev)
    return sendJson(res, result.ok ? 200 : 409, { rev: result.rev })
  }

  return sendJson(res, 405, { error: 'Method not allowed.' })
}

/**
 * Serves /api/library from a JSON file on disk (data/library.json by default, or IPTV_DATA_DIR)
 * for both `vite` and `vite preview`, so the library outlives any single browser's storage.
 */
export const libraryStorePlugin = (): Plugin => {
  const store = createLibraryStore(path.resolve(process.env.IPTV_DATA_DIR ?? 'data'))
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== ROUTE) return next()
    handle(store, req, res, url).catch((error: unknown) => {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'Library store failed.' })
    })
  }
  return {
    name: 'iptv-library-store',
    configureServer(server) { server.middlewares.use(middleware) },
    configurePreviewServer(server) { server.middlewares.use(middleware) },
  }
}
