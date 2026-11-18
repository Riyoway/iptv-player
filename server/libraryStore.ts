import { promises as fs } from 'node:fs'
import path from 'node:path'

/** Everything the player needs to remember. Kept as plain JSON so the file is easy to inspect or copy. */
export type StoredLibrary = {
  sources: unknown[]
  favorites: string[]
  history: string[]
}

export type StoredFile = {
  rev: number
  updatedAt: string
  library: StoredLibrary
}

export type WriteResult = { ok: true; rev: number } | { ok: false; rev: number }

const MAX_DAILY_BACKUPS = 14

export const isStoredLibrary = (value: unknown): value is StoredLibrary => {
  if (!value || typeof value !== 'object') return false
  const library = value as Record<string, unknown>
  return Array.isArray(library.sources)
    && Array.isArray(library.favorites) && library.favorites.every((item) => typeof item === 'string')
    && Array.isArray(library.history) && library.history.every((item) => typeof item === 'string')
}

/**
 * A single JSON file on disk that every browser on this machine shares.
 * Writes are atomic (temp file + rename), revision-checked so a stale client cannot
 * overwrite newer data, and the previous day's file is kept as a backup.
 */
export const createLibraryStore = (dataDir: string) => {
  const file = path.join(dataDir, 'library.json')
  const backupDir = path.join(dataDir, 'backups')
  let queue: Promise<unknown> = Promise.resolve()

  const read = async (): Promise<StoredFile | null> => {
    let text: string
    try {
      text = await fs.readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    const parsed = JSON.parse(text) as StoredFile
    if (typeof parsed?.rev !== 'number' || !isStoredLibrary(parsed.library)) throw new Error(`${file} is not a valid library file.`)
    return parsed
  }

  const backupOncePerDay = async (now: Date) => {
    const target = path.join(backupDir, `library-${now.toISOString().slice(0, 10)}.json`)
    try {
      await fs.access(target)
      return
    } catch { /* no backup yet today */ }
    await fs.mkdir(backupDir, { recursive: true })
    await fs.copyFile(file, target)
    const backups = (await fs.readdir(backupDir)).filter((name) => /^library-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()
    await Promise.all(backups.slice(0, Math.max(0, backups.length - MAX_DAILY_BACKUPS)).map((name) => fs.rm(path.join(backupDir, name))))
  }

  const write = (library: StoredLibrary, baseRev: number, now = new Date()): Promise<WriteResult> => {
    const run = async (): Promise<WriteResult> => {
      const current = await read()
      const currentRev = current?.rev ?? 0
      if (baseRev !== currentRev) return { ok: false, rev: currentRev }
      await fs.mkdir(dataDir, { recursive: true })
      if (current) await backupOncePerDay(now)
      const next: StoredFile = { rev: currentRev + 1, updatedAt: now.toISOString(), library }
      const temp = `${file}.${process.pid}.tmp`
      await fs.writeFile(temp, JSON.stringify(next))
      await fs.rename(temp, file)
      return { ok: true, rev: next.rev }
    }
    const result = queue.then(run, run)
    queue = result.catch(() => undefined)
    return result
  }

  return { file, read, write }
}

export type LibraryStore = ReturnType<typeof createLibraryStore>
