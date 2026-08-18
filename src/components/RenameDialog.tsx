import { Button, Input } from '@heroui/react'
import { Pencil, X } from 'lucide-react'
import { useEffect, useState } from 'react'

export function RenameDialog({
  open,
  currentName,
  onClose,
  onRename,
}: {
  open: boolean
  currentName: string
  onClose: () => void
  onRename: (name: string) => void
}) {
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
      <section className="import-dialog rename-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-source-title">
        <div className="dialog-handle" />
        <header className="dialog-header">
          <div>
            <span className="eyebrow">Source</span>
            <h2 id="rename-source-title">Rename source</h2>
          </div>
          <button className="round-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </header>

        <div className="field-stack">
          <label htmlFor="rename-source-name">Source name</label>
          <Input id="rename-source-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} autoFocus fullWidth variant="secondary" />
          <p>Use a short name that is easy to recognize in your library.</p>
        </div>

        <footer className="dialog-footer">
          <Button className="secondary-button" onPress={onClose}>Cancel</Button>
          <Button className="primary-button" isDisabled={!name.trim()} onPress={() => onRename(name.trim())}><Pencil size={17} /> Save name</Button>
        </footer>
      </section>
    </div>
  )
}
