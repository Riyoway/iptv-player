import type { PlaylistSource } from '../types/iptv'

const DB_NAME = 'iptv-player'
const DB_VERSION = 1
const STORE_NAME = 'state'
const SOURCES_KEY = 'sources-v1'

const KEYS = {
  legacySources: 'iptv-player:sources:v1',
  favorites: 'iptv-player:favorites:v1',
  history: 'iptv-player:history:v1',
  hideInvalidStreams: 'iptv-player:hide-invalid-streams:v1',
  fileSync: 'iptv-player:file-sync:v1',
}

const safeGet = (key: string) => {
  try { return localStorage.getItem(key) } catch { return null }
}

const safeSet = (key: string, value: string) => {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

const safeParse = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'))
  })

const readIndexed = async <T>(key: string): Promise<T | undefined> => {
  const db = await openDatabase()
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
  })
}

const writeIndexed = async <T>(key: string, value: T) => {
  const db = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(value, key)
    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    const fail = () => {
      db.close()
      reject(transaction.error ?? new Error('IndexedDB write failed.'))
    }
    transaction.onerror = fail
    // Quota errors abort the transaction without firing onerror.
    transaction.onabort = fail
  })
}

export type Library = {
  sources: PlaylistSource[]
  favorites: string[]
  history: string[]
}

export type LoadedLibrary = {
  library: Library
  /** False when storage could not be read, so an empty result must not be trusted or written back. */
  ok: boolean
}

const readFavorites = () => safeParse<string[]>(safeGet(KEYS.favorites), [])
const readHistory = () => safeParse<string[]>(safeGet(KEYS.history), [])

const loadBrowserSources = async (): Promise<{ sources: PlaylistSource[]; ok: boolean }> => {
  try {
    const indexed = await readIndexed<PlaylistSource[]>(SOURCES_KEY)
    if (indexed) return { sources: indexed, ok: true }

    const legacy = safeParse<PlaylistSource[]>(safeGet(KEYS.legacySources), [])
    if (legacy.length) {
      await writeIndexed(SOURCES_KEY, legacy)
      try { localStorage.removeItem(KEYS.legacySources) } catch { /* ignore */ }
    }
    return { sources: legacy, ok: true }
  } catch {
    const legacy = safeParse<PlaylistSource[]>(safeGet(KEYS.legacySources), [])
    return { sources: legacy, ok: legacy.length > 0 }
  }
}

const saveBrowserSources = async (sources: PlaylistSource[]) => {
  try {
    await writeIndexed(SOURCES_KEY, sources)
  } catch {
    // Small libraries still get a best-effort localStorage fallback when IndexedDB is unavailable.
    try {
      safeSet(KEYS.legacySources, JSON.stringify(sources))
    } catch {
      // Storage can be unavailable or over quota; the in-memory session remains usable.
    }
  }
}

// --- Library file on disk -------------------------------------------------
// When the app is served by its own dev/preview server, the library also lives in a
// JSON file on disk (see server/libraryStore.ts). That file is the source of truth:
// it is shared by every browser on the machine and survives cleared browser data.
// On static hosting the endpoint does not exist and the browser copy is used alone.

const LIBRARY_URL = '/api/library'
/** Revision of the file this tab last read or wrote; undefined when there is no library server. */
let fileRev: number | undefined

type FileResponse = { rev: number; library: Library | null }

const readJson = async (response: Response): Promise<Record<string, unknown> | undefined> => {
  if (!response.headers.get('content-type')?.includes('application/json')) return undefined
  const body: unknown = await response.json()
  return body && typeof body === 'object' ? body as Record<string, unknown> : undefined
}

const fetchLibraryFile = async (): Promise<FileResponse | undefined> => {
  try {
    const response = await fetch(LIBRARY_URL, { cache: 'no-store' })
    const body = response.ok ? await readJson(response) : undefined
    if (!body || typeof body.rev !== 'number') return undefined
    return { rev: body.rev, library: (body.library as Library | null) ?? null }
  } catch {
    return undefined
  }
}

const fetchLibraryFileRev = async (): Promise<number | undefined> => {
  try {
    const response = await fetch(`${LIBRARY_URL}?rev=1`, { cache: 'no-store' })
    const body = response.ok ? await readJson(response) : undefined
    return typeof body?.rev === 'number' ? body.rev : undefined
  } catch {
    return undefined
  }
}

const hasContent = (library: Library) => library.sources.length > 0 || library.favorites.length > 0 || library.history.length > 0

/** Keeps everything from the file and adds whatever only this browser has, so nothing is dropped. */
const mergeLibraries = (file: Library, browser: Library): Library => {
  const fileSourceIds = new Set(file.sources.map((source) => source.id))
  return {
    sources: [...file.sources, ...browser.sources.filter((source) => !fileSourceIds.has(source.id))],
    favorites: [...new Set([...file.favorites, ...browser.favorites])],
    history: [...new Set([...file.history, ...browser.history])].slice(0, 30),
  }
}

const libraryListeners = new Set<() => void>()
const notifyLibraryChanged = () => libraryListeners.forEach((listener) => listener())

type PushResult = 'saved' | 'conflict' | 'failed'

const pushLibraryFile = async (library: Library): Promise<PushResult> => {
  if (fileRev === undefined) return 'failed'
  try {
    const response = await fetch(LIBRARY_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRev: fileRev, library }),
    })
    const body = await readJson(response)
    if (response.ok && typeof body?.rev === 'number') {
      fileRev = body.rev
      safeSet(KEYS.fileSync, 'synced')
      return 'saved'
    }
    if (response.status === 409) return 'conflict'
  } catch { /* server unreachable */ }
  // Remember that this browser holds changes the file does not, so they are merged in next time.
  safeSet(KEYS.fileSync, 'pending')
  return 'failed'
}

export const loadLibrary = async (): Promise<LoadedLibrary> => {
  const [browserSources, file] = await Promise.all([loadBrowserSources(), fetchLibraryFile()])
  const browser: Library = { sources: browserSources.sources, favorites: readFavorites(), history: readHistory() }

  if (!file) {
    fileRev = undefined
    return { library: browser, ok: browserSources.ok }
  }

  fileRev = file.rev
  // A browser that has never synced, or that saved while the server was down, may hold data the file lacks.
  const browserHasUnsyncedData = safeGet(KEYS.fileSync) !== 'synced' && browserSources.ok && hasContent(browser)

  if (!file.library) {
    if (browserHasUnsyncedData) await pushLibraryFile(browser)
    else safeSet(KEYS.fileSync, 'synced')
    return { library: browser, ok: browserSources.ok }
  }

  if (!browserHasUnsyncedData) {
    safeSet(KEYS.fileSync, 'synced')
    void saveBrowserSources(file.library.sources)
    return { library: file.library, ok: true }
  }

  const merged = mergeLibraries(file.library, browser)
  await pushLibraryFile(merged)
  void saveBrowserSources(merged.sources)
  return { library: merged, ok: true }
}

const SYNC_CHANNEL = 'iptv-player:sources'
const syncChannel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(SYNC_CHANNEL)
// The shared channel object never receives its own messages, so this only fires for other tabs.
syncChannel?.addEventListener('message', notifyLibraryChanged)

if (typeof document !== 'undefined') {
  // Another browser may have changed the file while this tab was in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || fileRev === undefined) return
    const known = fileRev
    void fetchLibraryFileRev().then((rev) => {
      if (rev !== undefined && rev !== known && rev !== fileRev) notifyLibraryChanged()
    })
  })
}

/** Calls back when the saved library changed elsewhere (another tab or browser) and should be reloaded. */
export const subscribeToLibraryChanges = (onChange: () => void) => {
  libraryListeners.add(onChange)
  return () => { libraryListeners.delete(onChange) }
}

let persistenceRequested = false
/** Asks the browser not to evict the library under storage pressure or inactivity. */
const requestPersistentStorage = () => {
  if (persistenceRequested) return
  persistenceRequested = true
  try {
    void navigator.storage?.persist?.().catch(() => undefined)
  } catch { /* unsupported */ }
}

const persistLibrary = async (library: Library) => {
  await saveBrowserSources(library.sources)
  if (fileRev !== undefined && await pushLibraryFile(library) === 'conflict') {
    // Something newer is on disk. Adopt it rather than overwrite it with this tab's copy.
    notifyLibraryChanged()
    return
  }
  syncChannel?.postMessage('changed')
}

let pendingLibrary: Library | undefined
let activeSave: Promise<void> | undefined

// Saves run one at a time and always finish with the newest state, so a slow
// earlier write can never land after (and overwrite) a later one.
export const saveLibrary = (library: Library) => {
  if (library.sources.length) requestPersistentStorage()
  pendingLibrary = library
  activeSave ??= (async () => {
    try {
      while (pendingLibrary) {
        const next = pendingLibrary
        pendingLibrary = undefined
        await persistLibrary(next)
      }
    } finally {
      activeSave = undefined
    }
  })()
  return activeSave
}

export const loadFavorites = () => new Set(readFavorites())
export const saveFavorites = (favorites: Set<string>) =>
  safeSet(KEYS.favorites, JSON.stringify([...favorites]))

export const loadHistory = () => readHistory()
export const saveHistory = (history: string[]) => safeSet(KEYS.history, JSON.stringify(history.slice(0, 30)))

export const loadHideInvalidStreams = () => safeGet(KEYS.hideInvalidStreams) === 'true'
export const saveHideInvalidStreams = (value: boolean) => safeSet(KEYS.hideInvalidStreams, String(value))
