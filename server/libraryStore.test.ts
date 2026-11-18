import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLibraryStore, isStoredLibrary, type StoredLibrary } from './libraryStore'

const library = (name: string): StoredLibrary => ({ sources: [{ id: name, channels: [] }], favorites: ['a'], history: [] })

describe('library store', () => {
  let dir: string
  beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'iptv-store-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  it('returns null before anything is saved', async () => {
    expect(await createLibraryStore(dir).read()).toBeNull()
  })

  it('persists a library and survives a new store instance', async () => {
    expect(await createLibraryStore(dir).write(library('one'), 0)).toEqual({ ok: true, rev: 1 })
    const saved = await createLibraryStore(dir).read()
    expect(saved?.rev).toBe(1)
    expect(saved?.library).toEqual(library('one'))
  })

  it('rejects a write based on a stale revision and keeps the newer data', async () => {
    const store = createLibraryStore(dir)
    await store.write(library('one'), 0)
    await store.write(library('two'), 1)
    expect(await store.write(library('stale'), 1)).toEqual({ ok: false, rev: 2 })
    expect((await store.read())?.library).toEqual(library('two'))
  })

  it('applies concurrent writes in order', async () => {
    const store = createLibraryStore(dir)
    const results = await Promise.all([store.write(library('one'), 0), store.write(library('two'), 1), store.write(library('three'), 2)])
    expect(results.map((result) => result.ok)).toEqual([true, true, true])
    expect((await store.read())?.library).toEqual(library('three'))
  })

  it('keeps one backup of the previous file per day', async () => {
    const store = createLibraryStore(dir)
    const day = new Date('2026-01-02T10:00:00Z')
    await store.write(library('one'), 0, day)
    await store.write(library('two'), 1, day)
    await store.write(library('three'), 2, day)
    expect(await readdir(path.join(dir, 'backups'))).toEqual(['library-2026-01-02.json'])
    const backup = JSON.parse(await readFile(path.join(dir, 'backups', 'library-2026-01-02.json'), 'utf8'))
    expect(backup.library).toEqual(library('one'))
  })

  it('validates the library shape', () => {
    expect(isStoredLibrary(library('one'))).toBe(true)
    expect(isStoredLibrary({ sources: [], favorites: [1], history: [] })).toBe(false)
    expect(isStoredLibrary(null)).toBe(false)
  })
})
