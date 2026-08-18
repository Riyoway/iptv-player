import { Button, Chip } from '@heroui/react'
import {
  Clock3,
  Heart,
  ListVideo,
  Pencil,
  Plus,
  RadioTower,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { ChannelList } from './components/ChannelList'
import { ImportDialog, type ImportPayload } from './components/ImportDialog'
import { Player } from './components/Player'
import { RenameDialog } from './components/RenameDialog'
import { createImportResult, looksLikeHlsManifest, looksLikeM3uPlaylist, parseM3u, titleFromUrl } from './lib/m3u'
import { loadFavorites, loadHistory, loadSources, saveFavorites, saveHistory, saveSources } from './lib/storage'
import type { Channel, PlaylistSource } from './types/iptv'

type View = 'library' | 'favorites' | 'recent'
type SourceContextMenu = { sourceId: string; x: number; y: number }
type SourceScrollMetrics = { clientWidth: number; scrollWidth: number; scrollLeft: number }

const MAX_PLAYLIST_BYTES = 25 * 1024 * 1024

const readFile = (file: File) => file.text()

const probeRemoteText = async (url: string) => {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (!response.body) return await response.text()

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    let bytes = 0
    let playlistDetected = false
    const probeLimit = 96 * 1024

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      text += decoder.decode(value, { stream: true })

      if (!playlistDetected && looksLikeHlsManifest(text)) {
        void reader.cancel()
        break
      }

      if (!playlistDetected && looksLikeM3uPlaylist(text)) playlistDetected = true

      if (!playlistDetected && bytes >= probeLimit) {
        void reader.cancel()
        break
      }

      if (playlistDetected && bytes > MAX_PLAYLIST_BYTES) {
        void reader.cancel()
        throw new Error('Playlist is larger than the 25 MB browser import limit.')
      }
    }

    return text + decoder.decode()
  } finally {
    window.clearTimeout(timeout)
  }
}

export default function App() {
  const [sources, setSources] = useState<PlaylistSource[]>([])
  const [storageReady, setStorageReady] = useState(false)
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites())
  const [history, setHistory] = useState<string[]>(() => loadHistory())
  const [currentId, setCurrentId] = useState<string | undefined>()
  const [view, setView] = useState<View>('library')
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('All')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [importOpen, setImportOpen] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [refreshingSourceId, setRefreshingSourceId] = useState<string | null>(null)
  const [sourceContextMenu, setSourceContextMenu] = useState<SourceContextMenu | null>(null)
  const [renameSourceId, setRenameSourceId] = useState<string | null>(null)
  const sourceListRef = useRef<HTMLDivElement | null>(null)
  const sourceScrollbarDragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number } | null>(null)
  const sourceScrollTargetRef = useRef(0)
  const sourceScrollFrameRef = useRef<number | null>(null)
  const [sourceScrollMetrics, setSourceScrollMetrics] = useState<SourceScrollMetrics>({ clientWidth: 0, scrollWidth: 0, scrollLeft: 0 })

  const scrollSourceTo = useCallback((nextPosition: number, behavior: 'auto' | 'smooth' = 'auto') => {
    const sourceList = sourceListRef.current
    if (!sourceList) return
    const maxScroll = Math.max(0, sourceList.scrollWidth - sourceList.clientWidth)
    const nextScrollLeft = Math.max(0, Math.min(maxScroll, nextPosition))
    sourceScrollTargetRef.current = nextScrollLeft

    if (behavior === 'auto' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      if (sourceScrollFrameRef.current !== null) window.cancelAnimationFrame(sourceScrollFrameRef.current)
      sourceScrollFrameRef.current = null
      sourceList.scrollLeft = nextScrollLeft
      return
    }

    if (sourceScrollFrameRef.current !== null) return
    const animate = () => {
      const currentList = sourceListRef.current
      if (!currentList) {
        sourceScrollFrameRef.current = null
        return
      }
      const distance = sourceScrollTargetRef.current - currentList.scrollLeft
      if (Math.abs(distance) < 0.5) {
        currentList.scrollLeft = sourceScrollTargetRef.current
        sourceScrollFrameRef.current = null
        return
      }
      currentList.scrollLeft += distance * 0.22
      sourceScrollFrameRef.current = window.requestAnimationFrame(animate)
    }
    sourceScrollFrameRef.current = window.requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadSources().then((saved) => {
      if (!cancelled) {
        setSources(saved)
        setStorageReady(true)
      }
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (storageReady) void saveSources(sources)
  }, [sources, storageReady])
  useEffect(() => saveFavorites(favorites), [favorites])
  useEffect(() => saveHistory(history), [history])

  useEffect(() => {
    if (!sourceContextMenu) return
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-source-context-menu]')) return
      setSourceContextMenu(null)
    }
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSourceContextMenu(null)
    }
    const closeOnScroll = () => setSourceContextMenu(null)
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnKeyDown)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnKeyDown)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [sourceContextMenu])

  useEffect(() => {
    const sourceList = sourceListRef.current
    if (!sourceList || view !== 'library') {
      setSourceScrollMetrics({ clientWidth: 0, scrollWidth: 0, scrollLeft: 0 })
      return
    }
    const updateScrollMetrics = () => {
      const maxScroll = Math.max(0, sourceList.scrollWidth - sourceList.clientWidth)
      if (sourceScrollFrameRef.current === null) sourceScrollTargetRef.current = sourceList.scrollLeft
      else sourceScrollTargetRef.current = Math.max(0, Math.min(maxScroll, sourceScrollTargetRef.current))
      setSourceScrollMetrics({ clientWidth: sourceList.clientWidth, scrollWidth: sourceList.scrollWidth, scrollLeft: sourceList.scrollLeft })
    }
    const handleWheel = (event: WheelEvent) => {
      if (sourceList.scrollWidth <= sourceList.clientWidth) return
      const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (!delta) return
      scrollSourceTo(sourceScrollTargetRef.current + delta, 'smooth')
      event.preventDefault()
      event.stopPropagation()
    }
    updateScrollMetrics()
    sourceList.addEventListener('scroll', updateScrollMetrics, { passive: true })
    sourceList.addEventListener('wheel', handleWheel, { passive: false })
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateScrollMetrics)
    resizeObserver?.observe(sourceList)
    return () => {
      sourceList.removeEventListener('scroll', updateScrollMetrics)
      sourceList.removeEventListener('wheel', handleWheel)
      resizeObserver?.disconnect()
      if (sourceScrollFrameRef.current !== null) window.cancelAnimationFrame(sourceScrollFrameRef.current)
      sourceScrollFrameRef.current = null
    }
  }, [scrollSourceTo, sources.length, view])

  const allChannels = useMemo(() => sources.flatMap((source) => source.channels), [sources])
  const channelMap = useMemo(() => new Map(allChannels.map((channel) => [channel.id, channel])), [allChannels])
  const current = currentId ? channelMap.get(currentId) : undefined
  const deferredQuery = useDeferredValue(query)

  const groups = useMemo(() => {
    const channels = sourceFilter === 'all'
      ? allChannels
      : allChannels.filter((channel) => channel.sourceId === sourceFilter)
    const unique = new Set(channels.map((channel) => channel.group).filter(Boolean) as string[])
    return ['All', ...[...unique].sort((a, b) => a.localeCompare(b))]
  }, [allChannels, sourceFilter])

  const visibleChannels = useMemo(() => {
    let channels = allChannels
    if (view === 'favorites') channels = channels.filter((channel) => favorites.has(channel.id))
    if (view === 'recent') channels = history.map((id) => channelMap.get(id)).filter(Boolean) as Channel[]
    if (sourceFilter !== 'all') channels = channels.filter((channel) => channel.sourceId === sourceFilter)
    if (group !== 'All') channels = channels.filter((channel) => channel.group === group)
    if (deferredQuery.trim()) {
      const q = deferredQuery.toLowerCase()
      channels = channels.filter((channel) => `${channel.name} ${channel.group ?? ''}`.toLowerCase().includes(q))
    }
    return channels
  }, [allChannels, channelMap, deferredQuery, favorites, group, history, sourceFilter, view])

  const play = (channel: Channel) => {
    setCurrentId(channel.id)
    setHistory((previous) => [channel.id, ...previous.filter((id) => id !== channel.id)].slice(0, 30))
  }

  const toggleFavorite = (channel: Channel) => {
    setFavorites((previous) => {
      const next = new Set(previous)
      if (next.has(channel.id)) next.delete(channel.id)
      else next.add(channel.id)
      return next
    })
  }

  const addSource = (source: PlaylistSource) => {
    setSources((previous) => [source, ...previous])
    if (source.channels[0]) play(source.channels[0])
    setSourceFilter(source.id)
    setView('library')
    setImportOpen(false)
    setImportError(null)
    setQuery('')
    setGroup('All')
    setToast(source.kind === 'playlist' ? `Added ${source.channels.length} channels` : 'Stream added')
    window.setTimeout(() => setToast(null), 2200)
  }

  const handleImport = async (payload: ImportPayload) => {
    setImportBusy(true)
    setImportError(null)
    try {
      if (payload.type === 'url') {
        const url = payload.value.trim()
        const parsed = new URL(url)
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS stream URLs are supported.')

        const isM3u = /\.m3u(?:$|[?#])/i.test(url)
        const isM3u8 = /\.m3u8(?:$|[?#])/i.test(url)
        let content: string | undefined

        try {
          content = await probeRemoteText(url)
        } catch (error) {
          if (isM3u && !isM3u8) {
            throw new Error(`The M3U playlist could not be read in the browser. It may block CORS requests. ${error instanceof Error ? error.message : ''}`.trim())
          }
          // A direct stream can still be handed to the media element even when probing is blocked.
          content = undefined
        }

        const result = createImportResult({
          name: payload.name?.trim() || titleFromUrl(url),
          content: content && (looksLikeM3uPlaylist(content) || looksLikeHlsManifest(content)) ? content : undefined,
          url,
          origin: 'url',
        })
        addSource(result.source)
        return
      }

      if (payload.type === 'file') {
        if (payload.file.size > MAX_PLAYLIST_BYTES) throw new Error('Playlist files are limited to 25 MB.')
        const content = await readFile(payload.file)
        if (looksLikeHlsManifest(content)) {
          throw new Error('This is a standalone HLS manifest. Open its original M3U8 URL so relative media segments keep working.')
        }
        if (!looksLikeM3uPlaylist(content)) throw new Error('No IPTV playlist entries were found in this file.')
        const result = createImportResult({ name: payload.name?.trim() || payload.file.name.replace(/\.m3u8?$/i, ''), content, origin: 'file' })
        addSource(result.source)
        return
      }

      if (!looksLikeM3uPlaylist(payload.value)) {
        if (looksLikeHlsManifest(payload.value)) throw new Error('Paste the original M3U8 URL for standalone HLS manifests.')
        throw new Error('The pasted text does not look like an IPTV M3U playlist.')
      }
      const result = createImportResult({ name: payload.name?.trim() || 'Pasted playlist', content: payload.value, origin: 'text' })
      addSource(result.source)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Could not add this source.')
    } finally {
      setImportBusy(false)
    }
  }

  const refreshSource = async (source: PlaylistSource) => {
    if (!source.url || source.kind !== 'playlist') return
    setRefreshingSourceId(source.id)
    try {
      const content = await probeRemoteText(source.url)
      if (!looksLikeM3uPlaylist(content)) throw new Error('The URL no longer returns an IPTV playlist.')
      const channels = parseM3u(content, source.id, source.url)
      if (!channels.length) throw new Error('No playable entries were found.')
      setSources((previous) => previous.map((item) => item.id === source.id ? { ...item, channels } : item))
      setToast(`Updated ${channels.length} channels`)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not refresh this source')
    } finally {
      setRefreshingSourceId(null)
      window.setTimeout(() => setToast(null), 2400)
    }
  }

  const removeSource = (id: string) => {
    const source = sources.find((item) => item.id === id)
    if (!source) return
    const ids = new Set(source.channels.map((channel) => channel.id))
    setSources((previous) => previous.filter((item) => item.id !== id))
    setFavorites((previous) => new Set([...previous].filter((channelId) => !ids.has(channelId))))
    setHistory((previous) => previous.filter((channelId) => !ids.has(channelId)))
    if (currentId && ids.has(currentId)) setCurrentId(undefined)
    if (sourceFilter === id) {
      setSourceFilter('all')
      setGroup('All')
    }
    if (sourceContextMenu?.sourceId === id) setSourceContextMenu(null)
    if (renameSourceId === id) setRenameSourceId(null)
    setToast('Source removed')
    window.setTimeout(() => setToast(null), 1800)
  }

  const openSourceContextMenu = (event: ReactMouseEvent, sourceId: string) => {
    event.preventDefault()
    event.stopPropagation()
    setSourceContextMenu({ sourceId, x: event.clientX, y: event.clientY })
  }

  const openRenameDialog = (sourceId: string) => {
    setSourceContextMenu(null)
    setRenameSourceId(sourceId)
  }

  const renameSource = (sourceId: string, name: string) => {
    const nextName = name.trim()
    if (!nextName) return
    setSources((previous) => previous.map((source) => source.id === sourceId ? { ...source, name: nextName } : source))
    setRenameSourceId(null)
    setToast('Source renamed')
    window.setTimeout(() => setToast(null), 1800)
  }

  const resetFilters = (nextView: View) => {
    setView(nextView)
    setGroup('All')
    setSourceFilter('all')
    setQuery('')
  }

  const sourceMaxScroll = Math.max(0, sourceScrollMetrics.scrollWidth - sourceScrollMetrics.clientWidth)
  const sourceThumbWidth = sourceScrollMetrics.scrollWidth > 0
    ? Math.max(14, Math.min(100, (sourceScrollMetrics.clientWidth / sourceScrollMetrics.scrollWidth) * 100))
    : 100
  const sourceThumbLeft = sourceMaxScroll > 0
    ? (sourceScrollMetrics.scrollLeft / sourceMaxScroll) * (100 - sourceThumbWidth)
    : 0

  const handleSourceScrollbarTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const sourceList = sourceListRef.current
    if (!sourceList || sourceMaxScroll <= 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
    scrollSourceTo(ratio * sourceMaxScroll)
  }

  const handleSourceScrollbarThumbPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    scrollSourceTo(sourceListRef.current?.scrollLeft ?? 0)
    sourceScrollbarDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: sourceListRef.current?.scrollLeft ?? 0,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleSourceScrollbarThumbPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = sourceScrollbarDragRef.current
    const sourceList = sourceListRef.current
    const track = event.currentTarget.parentElement
    if (!drag || drag.pointerId !== event.pointerId || !sourceList || !track) return
    const thumbWidth = track.clientWidth * (sourceThumbWidth / 100)
    const travel = Math.max(1, track.clientWidth - thumbWidth)
    scrollSourceTo(drag.startScrollLeft + ((event.clientX - drag.startX) / travel) * sourceMaxScroll)
  }

  const handleSourceScrollbarThumbPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (sourceScrollbarDragRef.current?.pointerId !== event.pointerId) return
    sourceScrollbarDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleSourceScrollbarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const sourceList = sourceListRef.current
    if (!sourceList) return
    const step = Math.max(48, Math.round(sourceList.clientWidth * 0.25))
    if (event.key === 'ArrowLeft') scrollSourceTo(sourceScrollTargetRef.current - step, 'smooth')
    else if (event.key === 'ArrowRight') scrollSourceTo(sourceScrollTargetRef.current + step, 'smooth')
    else if (event.key === 'Home') scrollSourceTo(0, 'smooth')
    else if (event.key === 'End') scrollSourceTo(sourceMaxScroll, 'smooth')
    else return
    event.preventDefault()
  }

  return (
    <div className="app-shell">
      <aside className="nav-rail" aria-label="Primary navigation">
        <div className="brand-mark"><img src="/app-icon.png" alt="IPTV Player" /></div>
        <nav>
          <button className={view === 'library' ? 'active' : ''} onClick={() => resetFilters('library')}><ListVideo size={21} /><span>Library</span></button>
          <button className={view === 'favorites' ? 'active' : ''} onClick={() => resetFilters('favorites')}><Heart size={21} /><span>Favorites</span></button>
          <button className={view === 'recent' ? 'active' : ''} onClick={() => resetFilters('recent')}><Clock3 size={21} /><span>Recent</span></button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div>
            <span className="eyebrow">Local-first web player</span>
            <h1>IPTV Player</h1>
          </div>
          <Button className="primary-button add-desktop" isDisabled={!storageReady} onPress={() => setImportOpen(true)}><Plus size={18} /> Add source</Button>
        </header>

        <div className="content-grid">
          <div className="player-column">
            <Player channel={current} />
          </div>

          <section className="library-panel">
            <div className="library-heading">
              <div>
                <span className="eyebrow">{view}</span>
                <h2>{view === 'library' ? 'Channels' : view === 'favorites' ? 'Favorites' : 'Recently played'}</h2>
              </div>
              <Chip className="count-chip" size="sm" variant="soft">{visibleChannels.length.toLocaleString()}</Chip>
            </div>

            <label className="search-box">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search channels" />
              {query && <button onClick={() => setQuery('')} aria-label="Clear search">×</button>}
            </label>

            {sources.length > 0 && view === 'library' && (
              <div className="source-strip" aria-label="Sources">
                <button className={sourceFilter === 'all' ? 'active' : ''} onClick={() => { setSourceFilter('all'); setGroup('All') }}>All sources</button>
                <div className="source-scroll-area">
                  <div className="source-list" ref={sourceListRef}>
                    {sources.map((source) => (
                      <div
                        key={source.id}
                        className={`source-chip-wrap ${sourceFilter === source.id ? 'active' : ''}`}
                      >
                        <button className="source-chip-main" onClick={() => { setSourceFilter(source.id); setGroup('All') }}>
                          {source.kind === 'playlist' ? <ListVideo size={15} /> : <RadioTower size={15} />}
                          <span>{source.name}</span>
                          <em>{source.kind === 'playlist' ? source.channels.length : '1'}</em>
                        </button>
                        {source.origin === 'url' && source.kind === 'playlist' && (
                          <button className="source-action" disabled={refreshingSourceId === source.id} onClick={() => void refreshSource(source)} aria-label={`Refresh ${source.name}`}>
                            <RefreshCw className={refreshingSourceId === source.id ? 'spinning' : ''} size={14} />
                          </button>
                        )}
                        <button className="source-rename" onClick={() => openRenameDialog(source.id)} aria-label={`Rename ${source.name}`}>
                          <Pencil size={15} />
                        </button>
                        <button className="source-delete" onClick={() => removeSource(source.id)} aria-label={`Remove ${source.name}`}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                  {sourceMaxScroll > 0 && (
                    <div
                      className="source-scrollbar"
                      role="scrollbar"
                      aria-label="Playlist sources"
                      aria-valuemin={0}
                      aria-valuemax={sourceMaxScroll}
                      aria-valuenow={Math.round(sourceScrollMetrics.scrollLeft)}
                      tabIndex={0}
                      onKeyDown={handleSourceScrollbarKeyDown}
                      onPointerDown={handleSourceScrollbarTrackPointerDown}
                    >
                      <div
                        className="source-scrollbar-thumb"
                        aria-hidden="true"
                        style={{ width: `${sourceThumbWidth}%`, left: `${sourceThumbLeft}%` }}
                        onPointerDown={handleSourceScrollbarThumbPointerDown}
                        onPointerMove={handleSourceScrollbarThumbPointerMove}
                        onPointerUp={handleSourceScrollbarThumbPointerUp}
                        onPointerCancel={handleSourceScrollbarThumbPointerUp}
                        onLostPointerCapture={handleSourceScrollbarThumbPointerUp}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {groups.length > 1 && view === 'library' && (
              <div className="group-strip" aria-label="Channel groups">
                {groups.map((item) => <button key={item} className={group === item ? 'active' : ''} onClick={() => setGroup(item)}>{item}</button>)}
              </div>
            )}

            {!storageReady ? (
              <div className="list-empty"><span className="loader" /><strong>Loading library</strong></div>
            ) : allChannels.length === 0 ? (
              <div className="first-run">
                <div className="first-run-icon"><img src="/app-icon.png" alt="" /></div>
                <h3>Add your first source</h3>
                <p>Open an M3U or M3U8 URL, upload an IPTV playlist, or paste playlist text. Your library stays in this browser.</p>
                <Button className="primary-button" onPress={() => setImportOpen(true)}><Plus size={18} /> Add source</Button>
              </div>
            ) : (
              <ChannelList channels={visibleChannels} currentId={currentId} favorites={favorites} onPlay={play} onToggleFavorite={toggleFavorite} onRenameSource={openRenameDialog} onOpenContextMenu={openSourceContextMenu} />
            )}
          </section>
        </div>
      </main>

      <button className="mobile-fab" disabled={!storageReady} onClick={() => setImportOpen(true)} aria-label="Add source"><Plus size={24} /></button>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        <button className={view === 'library' ? 'active' : ''} onClick={() => resetFilters('library')}><ListVideo size={20} /><span>Library</span></button>
        <button className={view === 'favorites' ? 'active' : ''} onClick={() => resetFilters('favorites')}><Heart size={20} /><span>Favorites</span></button>
        <button className={view === 'recent' ? 'active' : ''} onClick={() => resetFilters('recent')}><Clock3 size={20} /><span>Recent</span></button>
      </nav>

      {sourceContextMenu && sources.some((source) => source.id === sourceContextMenu.sourceId) && (
        <div
          className="source-context-menu"
          data-source-context-menu
          role="menu"
          style={{
            left: Math.min(sourceContextMenu.x, Math.max(8, window.innerWidth - 180)),
            top: Math.min(sourceContextMenu.y, Math.max(8, window.innerHeight - 62)),
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button role="menuitem" onClick={() => openRenameDialog(sourceContextMenu.sourceId)}><Pencil size={16} /> Rename source</button>
        </div>
      )}

      <ImportDialog open={importOpen} busy={importBusy} error={importError} onClose={() => { setImportOpen(false); setImportError(null) }} onImport={handleImport} />
      <RenameDialog
        open={renameSourceId !== null}
        currentName={sources.find((source) => source.id === renameSourceId)?.name ?? ''}
        onClose={() => setRenameSourceId(null)}
        onRename={(name) => renameSourceId && renameSource(renameSourceId, name)}
      />
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}
