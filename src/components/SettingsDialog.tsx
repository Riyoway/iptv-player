import { Button } from '@heroui/react'
import { Check, ChevronDown, Languages, Monitor, Moon, Settings as SettingsIcon, Sun, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSettings, languageOptions, themeOptions, type LanguagePreference, type ThemePreference } from '../lib/i18n'

type SettingsSelectOption<T extends string> = { value: T; label: string }

function SettingsSelect<T extends string>({
  id,
  labelId,
  value,
  options,
  onChange,
  ariaLabel,
}: {
  id: string
  labelId: string
  value: T
  options: SettingsSelectOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))

  useEffect(() => {
    if (!open) return
    optionRefs.current[selectedIndex]?.focus()
    const closeOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const closeOnScroll = () => setOpen(false)
    document.addEventListener('pointerdown', closeOnPointerDown)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [open, selectedIndex])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const choose = (nextValue: T) => {
    onChange(nextValue)
    close()
  }

  const focusOption = (index: number) => {
    optionRefs.current[(index + options.length) % options.length]?.focus()
  }

  return (
    <div ref={rootRef} className={`settings-select-wrap ${open ? 'open' : ''}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`settings-select ${open ? 'open' : ''}`}
        aria-label={ariaLabel}
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span>{options[selectedIndex]?.label}</span>
        <ChevronDown className="settings-select-chevron" size={16} />
      </button>

      {open && (
        <div id={`${id}-menu`} className="settings-select-menu" role="listbox" aria-labelledby={labelId}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element }}
              type="button"
              className={`settings-select-option ${option.value === value ? 'active' : ''}`}
              role="option"
              aria-selected={option.value === value}
              onClick={() => choose(option.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  focusOption(index + 1)
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  focusOption(index - 1)
                } else if (event.key === 'Home') {
                  event.preventDefault()
                  focusOption(0)
                } else if (event.key === 'End') {
                  event.preventDefault()
                  focusOption(options.length - 1)
                } else if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  choose(option.value)
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  close()
                } else if (event.key === 'Tab') {
                  setOpen(false)
                }
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { languagePreference, themePreference, setLanguagePreference, setThemePreference, t } = useSettings()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null

  const languageLabel = (value: LanguagePreference) => {
    if (value === 'system') return t('settings.systemDefault')
    if (value === 'en') return 'English'
    if (value === 'ja') return '日本語'
    if (value === 'ko') return '한국어'
    return '中文'
  }

  const themeLabel = (value: ThemePreference) => {
    if (value === 'system') return t('settings.systemDefault')
    return value === 'dark' ? t('settings.dark') : t('settings.light')
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="import-dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="dialog-handle" />
        <header className="dialog-header">
          <div>
            <span className="eyebrow">{t('settings.title')}</span>
            <h2 id="settings-title">{t('settings.title')}</h2>
            <p className="settings-subtitle">{t('settings.subtitle')}</p>
          </div>
          <button className="round-button" onClick={onClose} aria-label={t('actions.close')}><X size={20} /></button>
        </header>

        <div className="settings-list">
          <div className="settings-row">
            <div className="settings-row-icon"><Languages size={19} /></div>
            <div className="settings-row-copy">
              <label id="settings-language-label" htmlFor="settings-language">{t('settings.language')}</label>
              <p>{t('settings.languageHint')}</p>
            </div>
            <SettingsSelect<LanguagePreference>
              id="settings-language"
              labelId="settings-language-label"
              value={languagePreference}
              options={languageOptions.map((option) => ({ value: option.value, label: languageLabel(option.value) }))}
              onChange={setLanguagePreference}
              ariaLabel={t('settings.language')}
            />
          </div>

          <div className="settings-row">
            <div className="settings-row-icon">{themePreference === 'dark' ? <Moon size={19} /> : themePreference === 'light' ? <Sun size={19} /> : <Monitor size={19} />}</div>
            <div className="settings-row-copy">
              <label id="settings-theme-label" htmlFor="settings-theme">{t('settings.theme')}</label>
              <p>{t('settings.themeHint')}</p>
            </div>
            <SettingsSelect<ThemePreference>
              id="settings-theme"
              labelId="settings-theme-label"
              value={themePreference}
              options={themeOptions.map((option) => ({ value: option.value, label: themeLabel(option.value) }))}
              onChange={setThemePreference}
              ariaLabel={t('settings.theme')}
            />
          </div>
        </div>

        <footer className="dialog-footer">
          <Button className="primary-button" onPress={onClose}><SettingsIcon size={17} /> {t('actions.close')}</Button>
        </footer>
      </section>
    </div>
  )
}
