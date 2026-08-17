import { Button, Input } from '@heroui/react'
import { FileUp, Link2, ListVideo, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export type ImportPayload =
  | { type: 'url'; value: string }
  | { type: 'file'; file: File }
  | { type: 'text'; value: string }

export function ImportDialog({
  open,
  busy,
  error,
  onClose,
  onImport,
}: {
  open: boolean
  busy: boolean
  error?: string | null
  onClose: () => void
  onImport: (payload: ImportPayload) => Promise<void>
}) {
  const [mode, setMode] = useState<'url' | 'file' | 'text'>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose, open])

  if (!open) return null

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="add-source-title">
        <div className="dialog-handle" />
        <header className="dialog-header">
          <div>
            <span className="eyebrow">Source</span>
            <h2 id="add-source-title">Add IPTV source</h2>
          </div>
          <button className="round-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </header>

        <div className="segmented-control">
          <button className={mode === 'url' ? 'active' : ''} onClick={() => setMode('url')}><Link2 size={17} /> URL</button>
          <button className={mode === 'file' ? 'active' : ''} onClick={() => setMode('file')}><FileUp size={17} /> File</button>
          <button className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')}><ListVideo size={17} /> Text</button>
        </div>

        {mode === 'url' && (
          <div className="field-stack">
            <label htmlFor="source-url">M3U / M3U8 URL</label>
            <Input id="source-url" className="text-input" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/playlist.m3u" autoFocus fullWidth variant="secondary" />
            <p>Remote playlists must allow browser CORS access. Direct M3U8 streams can still play without playlist parsing.</p>
          </div>
        )}

        {mode === 'file' && (
          <>
            <div
              className="drop-zone"
              role="button"
              tabIndex={0}
              aria-label="Choose or drop an M3U or M3U8 playlist file"
              onClick={() => fileRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  fileRef.current?.click()
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const file = event.dataTransfer.files?.[0]
                if (file) void onImport({ type: 'file', file })
              }}
            >
              <span className="drop-icon"><FileUp size={24} /></span>
              <strong>Drop or choose a playlist</strong>
              <span>.m3u or .m3u8 · parsed locally in your browser</span>
            </div>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept=".m3u,.m3u8,application/vnd.apple.mpegurl,audio/x-mpegurl"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void onImport({ type: 'file', file })
              }}
            />
          </>
        )}

        {mode === 'text' && (
          <div className="field-stack">
            <label htmlFor="playlist-text">M3U playlist text</label>
            <textarea id="playlist-text" className="text-input text-area" value={text} onChange={(event) => setText(event.target.value)} placeholder="#EXTM3U\n#EXTINF:-1,Example channel\nhttps://example.com/live.m3u8" />
            <p>Useful for quickly importing a playlist without saving a file.</p>
          </div>
        )}

        {error && <div className="dialog-error">{error}</div>}

        <footer className="dialog-footer">
          <Button className="secondary-button" onPress={onClose}>Cancel</Button>
          {mode !== 'file' && (
            <Button
              className="primary-button"
              isDisabled={busy || (mode === 'url' ? !url.trim() : !text.trim())}
              onPress={() => void onImport(mode === 'url' ? { type: 'url', value: url.trim() } : { type: 'text', value: text })}
            >
              {busy ? <span className="button-loader" /> : <Link2 size={17} />}
              {busy ? 'Adding…' : 'Add source'}
            </Button>
          )}
        </footer>
      </section>
    </div>
  )
}
