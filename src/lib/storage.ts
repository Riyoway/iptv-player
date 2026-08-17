import type { PlaylistSource } from '../types/iptv'

const DB_NAME = 'iptv-player'
const DB_VERSION = 1
const STORE_NAME = 'state'
const SOURCES_KEY = 'sources-v1'

const KEYS = {
  legacySources: 'iptv-player:sources:v1',
  favorites: 'iptv-player:favorites:v1',
  history: 'iptv-player:history:v1',
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
    transaction.onerror = () => reject(transaction.error)
  })
}

export const loadSources = async (): Promise<PlaylistSource[]> => {
  try {
    const indexed = await readIndexed<PlaylistSource[]>(SOURCES_KEY)
    if (indexed) return indexed

    const legacy = safeParse<PlaylistSource[]>(safeGet(KEYS.legacySources), [])
    if (legacy.length) {
      await writeIndexed(SOURCES_KEY, legacy)
      try { localStorage.removeItem(KEYS.legacySources) } catch { /* ignore */ }
    }
    return legacy
  } catch {
    return safeParse<PlaylistSource[]>(safeGet(KEYS.legacySources), [])
  }
}

export const saveSources = async (sources: PlaylistSource[]) => {
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

export const loadFavorites = () => new Set(safeParse<string[]>(safeGet(KEYS.favorites), []))
export const saveFavorites = (favorites: Set<string>) =>
  safeSet(KEYS.favorites, JSON.stringify([...favorites]))

export const loadHistory = () => safeParse<string[]>(safeGet(KEYS.history), [])
export const saveHistory = (history: string[]) => safeSet(KEYS.history, JSON.stringify(history.slice(0, 30)))
