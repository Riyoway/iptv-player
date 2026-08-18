import { Button, Input } from '@heroui/react'
import { ExternalLink, FileUp, Link2, ListVideo, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../lib/i18n'

export type ImportPayload =
  | { type: 'url'; value: string; name?: string }
  | { type: 'file'; file: File; name?: string }
  | { type: 'text'; value: string; name?: string }

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
  const { t } = useSettings()
  const [mode, setMode] = useState<'url' | 'file' | 'text'>('url')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setMode('url')
    setUrl('')
    setText('')
    setName('')
    setSelectedFile(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose, open])

  if (!open) return null

  const selectFile = (file: File | undefined) => {
    if (!file) return
    setSelectedFile(file)
    setName((current) => current.trim() ? current : file.name.replace(/\.m3u8?$/i, ''))
  }

  const submit = () => {
    if (mode === 'url') {
      void onImport({ type: 'url', value: url.trim(), name: name.trim() })
      return
    }
    if (mode === 'text') {
      void onImport({ type: 'text', value: text, name: name.trim() })
      return
    }
    if (selectedFile) void onImport({ type: 'file', file: selectedFile, name: name.trim() })
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="add-source-title">
        <div className="dialog-handle" />
        <header className="dialog-header">
          <div>
            <span className="eyebrow">{t('import.eyebrow')}</span>
            <h2 id="add-source-title">{t('import.title')}</h2>
          </div>
          <button className="round-button" onClick={onClose} aria-label={t('actions.close')}><X size={20} /></button>
        </header>

        <div className="segmented-control">
          <button className={mode === 'url' ? 'active' : ''} onClick={() => setMode('url')}><Link2 size={17} /> {t('import.urlTab')}</button>
          <button className={mode === 'file' ? 'active' : ''} onClick={() => setMode('file')}><FileUp size={17} /> {t('import.fileTab')}</button>
          <button className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')}><ListVideo size={17} /> {t('import.textTab')}</button>
        </div>

        <div className="field-stack source-name-field">
          <label htmlFor="source-name">{t('import.sourceName')} <span>({t('import.optional')})</span></label>
          <Input id="source-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={mode === 'file' ? t('import.fileNamePlaceholder') : mode === 'text' ? t('import.pastedNamePlaceholder') : t('import.playlistNamePlaceholder')} fullWidth variant="secondary" />
          <p>{t('import.nameHint')}</p>
        </div>

        {mode === 'url' && (
          <div className="field-stack">
            <label htmlFor="source-url">{t('import.urlLabel')}</label>
            <Input id="source-url" className="text-input" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder={t('import.urlPlaceholder')} autoFocus fullWidth variant="secondary" />
            <p>{t('import.urlHint')}</p>
            <a className="external-source-link" href="https://github.com/iptv-org/iptv/blob/master/PLAYLISTS.md" target="_blank" rel="noreferrer noopener">
              <ExternalLink size={16} /> {t('source.findPublic')}
            </a>
            <p className="source-legal-note">{t('source.legalNote')}</p>
          </div>
        )}

        {mode === 'file' && (
          <>
            <div
              className="drop-zone"
              role="button"
              tabIndex={0}
              aria-label={t('import.fileChoose')}
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
                selectFile(event.dataTransfer.files?.[0])
              }}
            >
              <span className="drop-icon"><FileUp size={24} /></span>
              <strong>{selectedFile ? selectedFile.name : t('import.fileChoose')}</strong>
              <span>{selectedFile ? t('import.fileReady') : t('import.fileHint')}</span>
            </div>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept=".m3u,.m3u8,application/vnd.apple.mpegurl,audio/x-mpegurl"
              onChange={(event) => {
                selectFile(event.target.files?.[0])
              }}
            />
          </>
        )}

        {mode === 'text' && (
          <div className="field-stack">
            <label htmlFor="playlist-text">{t('import.textLabel')}</label>
            <textarea id="playlist-text" className="text-input text-area" value={text} onChange={(event) => setText(event.target.value)} placeholder={t('import.textPlaceholder')} />
            <p>{t('import.textHint')}</p>
          </div>
        )}

        {error && <div className="dialog-error">{error}</div>}

        <footer className="dialog-footer">
          <Button className="secondary-button" onPress={onClose}>{t('actions.cancel')}</Button>
          <Button
            className="primary-button"
            isDisabled={busy || (mode === 'url' ? !url.trim() : mode === 'text' ? !text.trim() : !selectedFile)}
            onPress={submit}
          >
            {busy ? <span className="button-loader" /> : <Link2 size={17} />}
            {busy ? t('actions.adding') : t('actions.addSource')}
          </Button>
        </footer>
      </section>
    </div>
  )
}
