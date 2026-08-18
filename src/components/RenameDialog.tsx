import { Button, Input } from '@heroui/react'
import { Pencil, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSettings } from '../lib/i18n'

export function RenameDialog({
  open,
  currentName,
  onClose,
  onRename,
  entityLabel = 'source',
}: {
  open: boolean
  currentName: string
  onClose: () => void
  onRename: (name: string) => void
  entityLabel?: 'source' | 'channel'
}) {
  const { t } = useSettings()
  const [name, setName] = useState(currentName)

  useEffect(() => {
    if (open) setName(currentName)
  }, [currentName, open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="import-dialog rename-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-name-title">
        <div className="dialog-handle" />
        <header className="dialog-header">
          <div>
            <span className="eyebrow">{t(entityLabel === 'channel' ? 'rename.channelEyebrow' : 'rename.sourceEyebrow')}</span>
            <h2 id="rename-name-title">{t(entityLabel === 'channel' ? 'rename.channelTitle' : 'rename.sourceTitle')}</h2>
          </div>
          <button className="round-button" onClick={onClose} aria-label={t('actions.close')}><X size={20} /></button>
        </header>

        <div className="field-stack">
          <label htmlFor="rename-name">{t(entityLabel === 'channel' ? 'rename.channelLabel' : 'rename.sourceLabel')}</label>
          <Input id="rename-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} autoFocus fullWidth variant="secondary" />
          <p>{t('rename.hint')}</p>
        </div>

        <footer className="dialog-footer">
          <Button className="secondary-button" onPress={onClose}>{t('actions.cancel')}</Button>
          <Button className="primary-button" isDisabled={!name.trim()} onPress={() => onRename(name.trim())}><Pencil size={17} /> {t('actions.saveName')}</Button>
        </footer>
      </section>
    </div>
  )
}
