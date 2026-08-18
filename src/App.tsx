import { Button, Chip } from '@heroui/react'
import {
  Clock3,
  Check,
  ChevronDown,
  ExternalLink,
  Heart,
  ListVideo,
  Pencil,
  Plus,
  RadioTower,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Trash2,
} from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { ChannelList } from './components/ChannelList'
import { CategoryIcon } from './components/CategoryIcon'
import { ImportDialog, type ImportPayload } from './components/ImportDialog'
import { Player } from './components/Player'
import { RenameDialog } from './components/RenameDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { createImportResult, getChannelGroups, looksLikeHlsManifest, looksLikeM3uPlaylist, parseM3u, titleFromUrl } from './lib/m3u'
import { checkStreams } from './lib/streamChecker'
import { loadFavorites, loadHideInvalidStreams, loadHistory, loadSources, saveFavorites, saveHideInvalidStreams, saveHistory, saveSources } from './lib/storage'
import { useSettings } from './lib/i18n'
import type { Channel, PlaylistSource } from './types/iptv'

type View = 'library' | 'favorites' | 'recent'
type ChannelContextMenu = { channelId: string; x: number; y: number }
type GroupStripDrag = { pointerId: number; startX: number; startY: number; startScrollLeft: number; moved: boolean }

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
  const { t } = useSettings()
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
  const [channelContextMenu, setChannelContextMenu] = useState<ChannelContextMenu | null>(null)
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false)
  const [renameSourceId, setRenameSourceId] = useState<string | null>(null)
  const [renameChannelId, setRenameChannelId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hideInvalidStreams, setHideInvalidStreams] = useState(() => loadHideInvalidStreams())
  const [streamCheckProgress, setStreamCheckProgress] = useState<{ completed: number; total: number } | null>(null)
  const sourceDropdownRef = useRef<HTMLDivElement | null>(null)
  const groupStripDragRef = useRef<GroupStripDrag | null>(null)
  const suppressGroupClickRef = useRef(false)
  const streamCheckAbortRef = useRef<AbortController | null>(null)

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
  useEffect(() => saveHideInvalidStreams(hideInvalidStreams), [hideInvalidStreams])
  useEffect(() => () => streamCheckAbortRef.current?.abort(), [])

  useEffect(() => {
    if (!channelContextMenu) return
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-channel-context-menu]')) return
      setChannelContextMenu(null)
    }
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setChannelContextMenu(null)
    }
    const closeOnScroll = () => setChannelContextMenu(null)
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnKeyDown)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnKeyDown)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [channelContextMenu])

  useEffect(() => {
    if (!sourceDropdownOpen) return
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && sourceDropdownRef.current?.contains(target)) return
      setSourceDropdownOpen(false)
    }
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSourceDropdownOpen(false)
    }
    const closeOnScroll = () => setSourceDropdownOpen(false)
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnKeyDown)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnKeyDown)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [sourceDropdownOpen])

  const allChannels = useMemo(() => sources.flatMap((source) => source.channels), [sources])
  const channelMap = useMemo(() => new Map(allChannels.map((channel) => [channel.id, channel])), [allChannels])
  const current = currentId ? channelMap.get(currentId) : undefined
  const deferredQuery = useDeferredValue(query)

  const groups = useMemo(() => {
    const channels = sourceFilter === 'all'
      ? allChannels
      : allChannels.filter((channel) => channel.sourceId === sourceFilter)
    const unique = new Set(channels.flatMap((channel) => getChannelGroups(channel)))
    return ['All', ...[...unique].sort((a, b) => a.localeCompare(b))]
  }, [allChannels, sourceFilter])

  const visibleChannels = useMemo(() => {
    let channels = allChannels
    if (hideInvalidStreams) channels = channels.filter((channel) => channel.streamCheck?.status !== 'unavailable')
    if (view === 'favorites') channels = channels.filter((channel) => favorites.has(channel.id))
    if (view === 'recent') channels = history.map((id) => channelMap.get(id)).filter(Boolean) as Channel[]
    if (sourceFilter !== 'all') channels = channels.filter((channel) => channel.sourceId === sourceFilter)
    if (group !== 'All') channels = channels.filter((channel) => getChannelGroups(channel).includes(group))
    if (deferredQuery.trim()) {
      const q = deferredQuery.toLowerCase()
      channels = channels.filter((channel) => `${channel.name} ${getChannelGroups(channel).join(' ')}`.toLowerCase().includes(q))
    }
    return channels
  }, [allChannels, channelMap, deferredQuery, favorites, group, hideInvalidStreams, history, sourceFilter, view])

  const hiddenInvalidCount = useMemo(() => allChannels.filter((channel) => channel.streamCheck?.status === 'unavailable').length, [allChannels])

  const startGroupStripDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    groupStripDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: event.currentTarget.scrollLeft,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveGroupStripDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return
    const drag = groupStripDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (!drag.moved && (Math.abs(deltaX) < 4 || Math.abs(deltaX) <= Math.abs(deltaY))) return
    drag.moved = true
    event.preventDefault()
    event.currentTarget.scrollLeft = drag.startScrollLeft - deltaX
  }

  const endGroupStripDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return
    const drag = groupStripDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.moved) suppressGroupClickRef.current = true
    groupStripDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handleGroupStripWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const strip = event.currentTarget
    if (strip.scrollWidth <= strip.clientWidth) return
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (!delta) return
    event.preventDefault()
    strip.scrollLeft += delta
  }

  const suppressDraggedGroupClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressGroupClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressGroupClickRef.current = false
  }

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
    setToast(source.kind === 'playlist' ? t('toast.addedChannels', { count: source.channels.length }) : t('toast.streamAdded'))
    window.setTimeout(() => setToast(null), 2200)
  }

  const handleImport = async (payload: ImportPayload) => {
    setImportBusy(true)
    setImportError(null)
    try {
      if (payload.type === 'url') {
        const url = payload.value.trim()
        const parsed = new URL(url)
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(t('errors.httpOnly'))

        const isM3u = /\.m3u(?:$|[?#])/i.test(url)
        const isM3u8 = /\.m3u8(?:$|[?#])/i.test(url)
        let content: string | undefined

        try {
          content = await probeRemoteText(url)
        } catch (error) {
          if (isM3u && !isM3u8) {
            throw new Error(t('errors.m3uCors', { details: error instanceof Error ? ` ${error.message}` : '' }).trim())
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
        if (payload.file.size > MAX_PLAYLIST_BYTES) throw new Error(t('errors.playlistTooLarge'))
        const content = await readFile(payload.file)
        if (looksLikeHlsManifest(content)) {
          throw new Error(t('errors.standaloneHlsFile'))
        }
        if (!looksLikeM3uPlaylist(content)) throw new Error(t('errors.noPlaylistEntries'))
        const result = createImportResult({ name: payload.name?.trim() || payload.file.name.replace(/\.m3u8?$/i, ''), content, origin: 'file' })
        addSource(result.source)
        return
      }

      if (!looksLikeM3uPlaylist(payload.value)) {
        if (looksLikeHlsManifest(payload.value)) throw new Error(t('errors.pastedHls'))
        throw new Error(t('errors.pastedInvalid'))
      }
      const result = createImportResult({ name: payload.name?.trim() || t('import.pastedNamePlaceholder'), content: payload.value, origin: 'text' })
      addSource(result.source)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : t('errors.addSource'))
    } finally {
      setImportBusy(false)
    }
  }

  const refreshSource = async (source: PlaylistSource) => {
    if (!source.url || source.kind !== 'playlist') return
    setRefreshingSourceId(source.id)
    try {
      const content = await probeRemoteText(source.url)
      if (!looksLikeM3uPlaylist(content)) throw new Error(t('errors.urlNotPlaylist'))
      const channels = parseM3u(content, source.id, source.url)
      if (!channels.length) throw new Error(t('errors.noPlayableEntries'))
      setSources((previous) => previous.map((item) => item.id === source.id ? { ...item, channels } : item))
      setToast(t('toast.updatedChannels', { count: channels.length }))
    } catch (error) {
      setToast(error instanceof Error ? error.message : t('errors.sourceRefresh'))
    } finally {
      setRefreshingSourceId(null)
      window.setTimeout(() => setToast(null), 2400)
    }
  }

  const stopStreamCheck = () => {
    streamCheckAbortRef.current?.abort()
  }

  const checkAllStreams = async () => {
    if (streamCheckAbortRef.current) return
    if (!allChannels.length) {
      setToast(t('settings.checkNoStreams'))
      window.setTimeout(() => setToast(null), 2200)
      return
    }

    const controller = new AbortController()
    streamCheckAbortRef.current = controller
    const total = allChannels.length
    let available = 0
    setStreamCheckProgress({ completed: 0, total })

    try {
      await checkStreams(
        allChannels.map((channel) => ({ id: channel.id, url: channel.url })),
        {
          concurrency: 4,
          timeoutMs: 10000,
          signal: controller.signal,
          onProgress: ({ completed, id, result }) => {
            if (result.status === 'available') available += 1
            setSources((previous) => previous.map((source) => {
              if (!source.channels.some((channel) => channel.id === id)) return source
              return {
                ...source,
                channels: source.channels.map((channel) => channel.id === id ? { ...channel, streamCheck: result } : channel),
              }
            }))
            setStreamCheckProgress({ completed, total })
          },
        },
      )
      setToast(t('toast.streamCheckComplete', { total, available }))
    } catch (error) {
      if (controller.signal.aborted) setToast(t('toast.streamCheckCancelled'))
      else setToast(error instanceof Error ? error.message : t('errors.streamCheck'))
    } finally {
      streamCheckAbortRef.current = null
      setStreamCheckProgress(null)
      window.setTimeout(() => setToast(null), 2600)
    }
  }

  const removeSource = (id: string) => {
    const source = sources.find((item) => item.id === id)
    if (!source) return
    setSourceDropdownOpen(false)
    const ids = new Set(source.channels.map((channel) => channel.id))
    setSources((previous) => previous.filter((item) => item.id !== id))
    setFavorites((previous) => new Set([...previous].filter((channelId) => !ids.has(channelId))))
    setHistory((previous) => previous.filter((channelId) => !ids.has(channelId)))
    if (currentId && ids.has(currentId)) setCurrentId(undefined)
    if (sourceFilter === id) {
      setSourceFilter('all')
      setGroup('All')
    }
    if (channelContextMenu && ids.has(channelContextMenu.channelId)) setChannelContextMenu(null)
    if (renameSourceId === id) setRenameSourceId(null)
    if (renameChannelId && ids.has(renameChannelId)) setRenameChannelId(null)
    setToast(t('toast.sourceRemoved'))
    window.setTimeout(() => setToast(null), 1800)
  }

  const openChannelContextMenu = (event: ReactMouseEvent, channelId: string) => {
    event.preventDefault()
    event.stopPropagation()
    setChannelContextMenu({ channelId, x: event.clientX, y: event.clientY })
  }

  const openRenameDialog = (sourceId: string) => {
    setChannelContextMenu(null)
    setSourceDropdownOpen(false)
    setRenameSourceId(sourceId)
  }

  const openChannelRenameDialog = (channelId: string) => {
    setChannelContextMenu(null)
    setRenameChannelId(channelId)
  }

  const renameSource = (sourceId: string, name: string) => {
    const nextName = name.trim()
    if (!nextName) return
    setSources((previous) => previous.map((source) => source.id === sourceId ? { ...source, name: nextName } : source))
    setRenameSourceId(null)
    setToast(t('toast.sourceRenamed'))
    window.setTimeout(() => setToast(null), 1800)
  }

  const renameChannel = (channelId: string, name: string) => {
    const nextName = name.trim()
    if (!nextName) return
    setSources((previous) => previous.map((source) => ({
      ...source,
      channels: source.channels.map((channel) => channel.id === channelId ? { ...channel, name: nextName } : channel),
    })))
    setRenameChannelId(null)
    setToast(t('toast.channelRenamed'))
    window.setTimeout(() => setToast(null), 1800)
  }

  const resetFilters = (nextView: View) => {
    setView(nextView)
    setGroup('All')
    setSourceFilter('all')
    setSourceDropdownOpen(false)
    setQuery('')
  }

  const selectSource = (sourceId: string) => {
    setSourceFilter(sourceId)
    setGroup('All')
    setSourceDropdownOpen(false)
  }

  const selectedSource = sourceFilter === 'all' ? undefined : sources.find((source) => source.id === sourceFilter)

  return (
    <div className="app-shell">
      <aside className="nav-rail" aria-label={t('nav.primary')}>
        <div className="brand-mark"><img src="/app-icon.png" alt="IPTV Player" /></div>
        <nav>
          <button className={view === 'library' ? 'active' : ''} onClick={() => resetFilters('library')}><ListVideo size={21} /><span>{t('nav.library')}</span></button>
          <button className={view === 'favorites' ? 'active' : ''} onClick={() => resetFilters('favorites')}><Heart size={21} /><span>{t('nav.favorites')}</span></button>
          <button className={view === 'recent' ? 'active' : ''} onClick={() => resetFilters('recent')}><Clock3 size={21} /><span>{t('nav.recent')}</span></button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div>
            <h1>IPTV Player</h1>
          </div>
          <div className="top-actions">
            <Button className="secondary-button settings-button" onPress={() => setSettingsOpen(true)} aria-label={t('settings.open')}><SettingsIcon size={18} /><span>{t('settings.title')}</span></Button>
            <Button className="primary-button add-desktop" isDisabled={!storageReady} onPress={() => setImportOpen(true)}><Plus size={18} /> {t('actions.addSource')}</Button>
          </div>
        </header>

        <div className="content-grid">
          <div className="player-column">
            <Player channel={current} />
          </div>

          <section className="library-panel">
            <div className="library-heading">
              <div>
                <span className="eyebrow">{t(`views.${view}`)}</span>
                <h2>{view === 'library' ? t('headings.channels') : view === 'favorites' ? t('headings.favorites') : t('headings.recent')}</h2>
              </div>
              <div className="library-heading-meta">
                <Chip className="count-chip" size="sm" variant="soft">{visibleChannels.length.toLocaleString()}</Chip>
                {hideInvalidStreams && hiddenInvalidCount > 0 && <span className="hidden-invalid-note">{t('channels.hiddenInvalid', { count: hiddenInvalidCount })}</span>}
              </div>
            </div>

            <label className="search-box">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search.channels')} />
              {query && <button onClick={() => setQuery('')} aria-label={t('actions.clearSearch')}>×</button>}
            </label>

            {sources.length > 0 && view === 'library' && (
              <div className="source-picker" ref={sourceDropdownRef}>
                <button
                  type="button"
                  className={`source-picker-trigger ${sourceDropdownOpen ? 'open' : ''}`}
                  aria-haspopup="menu"
                  aria-expanded={sourceDropdownOpen}
                  onClick={() => setSourceDropdownOpen((open) => !open)}
                >
                  {selectedSource ? (selectedSource.kind === 'playlist' ? <ListVideo size={18} /> : <RadioTower size={18} />) : <ListVideo size={18} />}
                  <span>{selectedSource?.name ?? t('source.all')}</span>
                  <em>{selectedSource ? (selectedSource.kind === 'playlist' ? selectedSource.channels.length : '1') : allChannels.length}</em>
                  <ChevronDown className="source-picker-chevron" size={18} />
                </button>

                {sourceDropdownOpen && (
                  <div className="source-picker-menu" role="menu" aria-label={t('source.sources')}>
                    <button
                      type="button"
                      className={`source-picker-option ${sourceFilter === 'all' ? 'active' : ''}`}
                      role="menuitemradio"
                      aria-checked={sourceFilter === 'all'}
                      onClick={() => selectSource('all')}
                    >
                      <ListVideo size={17} />
                      <span>{t('source.all')}</span>
                      <em>{allChannels.length}</em>
                      {sourceFilter === 'all' && <Check className="source-picker-check" size={16} />}
                    </button>

                    {sources.map((source) => (
                      <div key={source.id} className={`source-picker-row ${sourceFilter === source.id ? 'active' : ''}`}>
                        <button
                          type="button"
                          className="source-picker-option"
                          role="menuitemradio"
                          aria-checked={sourceFilter === source.id}
                          onClick={() => selectSource(source.id)}
                        >
                          {source.kind === 'playlist' ? <ListVideo size={17} /> : <RadioTower size={17} />}
                          <span>{source.name}</span>
                          <em>{source.kind === 'playlist' ? source.channels.length : '1'}</em>
                          {sourceFilter === source.id && <Check className="source-picker-check" size={16} />}
                        </button>
                        <div className="source-picker-actions">
                          {source.origin === 'url' && source.kind === 'playlist' && (
                            <button className="source-action" type="button" disabled={refreshingSourceId === source.id} onClick={() => { setSourceDropdownOpen(false); void refreshSource(source) }} aria-label={t('actions.refresh', { name: source.name })}>
                              <RefreshCw className={refreshingSourceId === source.id ? 'spinning' : ''} size={14} />
                            </button>
                          )}
                          <button className="source-rename" type="button" onClick={() => openRenameDialog(source.id)} aria-label={t('actions.rename', { name: source.name })}>
                            <Pencil size={15} />
                          </button>
                          <button className="source-delete" type="button" onClick={() => removeSource(source.id)} aria-label={t('actions.remove', { name: source.name })}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {groups.length > 1 && view === 'library' && (
              <div
                className="group-strip"
                aria-label="Channel groups"
                onPointerDown={startGroupStripDrag}
                onPointerMove={moveGroupStripDrag}
                onPointerUp={endGroupStripDrag}
                onPointerCancel={endGroupStripDrag}
                onWheel={handleGroupStripWheel}
                onClickCapture={suppressDraggedGroupClick}
              >
                {groups.map((item) => <button key={item} className={group === item ? 'active' : ''} onClick={() => setGroup(item)}><CategoryIcon name={item} /><span>{item}</span></button>)}
              </div>
            )}

            {!storageReady ? (
              <div className="list-empty"><span className="loader" /><strong>{t('library.loading')}</strong></div>
            ) : allChannels.length === 0 ? (
              <div className="first-run">
                <div className="first-run-icon"><img src="/app-icon.png" alt="" /></div>
                <h3>{t('firstRun.title')}</h3>
                <p>{t('firstRun.description')}</p>
                <Button className="primary-button" onPress={() => setImportOpen(true)}><Plus size={18} /> {t('actions.addSource')}</Button>
                <a className="external-source-link" href="https://github.com/iptv-org/iptv/blob/master/PLAYLISTS.md" target="_blank" rel="noreferrer noopener">
                  <ExternalLink size={16} /> {t('source.findPublic')}
                </a>
              </div>
            ) : (
              <ChannelList channels={visibleChannels} currentId={currentId} favorites={favorites} onPlay={play} onToggleFavorite={toggleFavorite} onRenameChannel={openChannelRenameDialog} onOpenContextMenu={openChannelContextMenu} />
            )}
          </section>
        </div>
      </main>

      <button className="mobile-fab" disabled={!storageReady} onClick={() => setImportOpen(true)} aria-label={t('actions.addSource')}><Plus size={24} /></button>
      <nav className="bottom-nav" aria-label={t('nav.mobile')}>
        <button className={view === 'library' ? 'active' : ''} onClick={() => resetFilters('library')}><ListVideo size={20} /><span>{t('nav.library')}</span></button>
        <button className={view === 'favorites' ? 'active' : ''} onClick={() => resetFilters('favorites')}><Heart size={20} /><span>{t('nav.favorites')}</span></button>
        <button className={view === 'recent' ? 'active' : ''} onClick={() => resetFilters('recent')}><Clock3 size={20} /><span>{t('nav.recent')}</span></button>
      </nav>

      {channelContextMenu && channelMap.has(channelContextMenu.channelId) && (
        <div
          className="source-context-menu"
          data-channel-context-menu
          role="menu"
          style={{
            left: Math.min(channelContextMenu.x, Math.max(8, window.innerWidth - 180)),
            top: Math.min(channelContextMenu.y, Math.max(8, window.innerHeight - 62)),
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button role="menuitem" onClick={() => openChannelRenameDialog(channelContextMenu.channelId)}><Pencil size={16} /> {t('context.renameChannel')}</button>
        </div>
      )}

      <ImportDialog open={importOpen} busy={importBusy} error={importError} onClose={() => { setImportOpen(false); setImportError(null) }} onImport={handleImport} />
      <RenameDialog
        open={renameSourceId !== null}
        currentName={sources.find((source) => source.id === renameSourceId)?.name ?? ''}
        onClose={() => setRenameSourceId(null)}
        onRename={(name) => renameSourceId && renameSource(renameSourceId, name)}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        hideInvalidStreams={hideInvalidStreams}
        onHideInvalidStreamsChange={setHideInvalidStreams}
        checkProgress={streamCheckProgress}
        onCheckStreams={() => { void checkAllStreams() }}
        onCancelCheck={stopStreamCheck}
      />
      <RenameDialog
        open={renameChannelId !== null}
        currentName={channelMap.get(renameChannelId ?? '')?.name ?? ''}
        entityLabel="channel"
        onClose={() => setRenameChannelId(null)}
        onRename={(name) => renameChannelId && renameChannel(renameChannelId, name)}
      />
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}
