import { CircleCheck, CircleHelp, CircleX, Heart, Pencil, Play, Radio, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { getChannelGroups } from '../lib/m3u'
import { useSettings } from '../lib/i18n'
import type { Channel } from '../types/iptv'

const PAGE_SIZE = 200

export function ChannelList({
  channels,
  currentId,
  favorites,
  onPlay,
  onToggleFavorite,
  onRenameChannel,
  onOpenContextMenu,
}: {
  channels: Channel[]
  currentId?: string
  favorites: Set<string>
  onPlay: (channel: Channel) => void
  onToggleFavorite: (channel: Channel) => void
  onRenameChannel?: (channelId: string) => void
  onOpenContextMenu?: (event: ReactMouseEvent<HTMLElement>, channelId: string) => void
}) {
  const { t } = useSettings()
  const [limit, setLimit] = useState(PAGE_SIZE)

  useEffect(() => setLimit(PAGE_SIZE), [channels])

  if (!channels.length) {
    return (
      <div className="list-empty">
        <SearchX size={26} />
        <strong>{t('channels.none')}</strong>
        <span>{t('channels.noneHint')}</span>
      </div>
    )
  }

  const visible = channels.slice(0, limit)

  return (
    <div className="channel-list">
      {visible.map((channel) => {
        const active = channel.id === currentId
        const favorite = favorites.has(channel.id)
        const channelGroups = getChannelGroups(channel)
        return (
          <article
            key={channel.id}
            className={`channel-row ${active ? 'active' : ''}`}
            onContextMenuCapture={(event) => {
              if (onOpenContextMenu) onOpenContextMenu(event, channel.id)
            }}
          >
            <button className="channel-main" onClick={() => onPlay(channel)}>
              <div className="channel-art">
                <Radio className="logo-fallback" size={20} />
                {channel.logo && <img src={channel.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = 'none' }} />}
                <span className="play-overlay"><Play size={17} fill="currentColor" /></span>
              </div>
              <div className="channel-copy">
                <strong>
                  {channel.name}
                  {channel.streamCheck && (
                    <span className={`stream-status ${channel.streamCheck.status}`} title={channel.streamCheck.detail} aria-label={t(`channels.stream${channel.streamCheck.status === 'available' ? 'Available' : channel.streamCheck.status === 'unavailable' ? 'Unavailable' : 'Unverified'}`)}>
                      {channel.streamCheck.status === 'available' ? <CircleCheck size={14} /> : channel.streamCheck.status === 'unavailable' ? <CircleX size={14} /> : <CircleHelp size={14} />}
                    </span>
                  )}
                </strong>
              <span>{channelGroups.join(' · ') || t('channels.ungrouped')}</span>
              </div>
              {active && <span className="playing-badge"><i /> {t('channels.playing')}</span>}
            </button>
            {onRenameChannel && (
              <button className="channel-rename-button" onClick={() => onRenameChannel(channel.id)} aria-label={t('channels.rename', { name: channel.name })}>
                <Pencil size={17} />
              </button>
            )}
            <button className={`favorite-button ${favorite ? 'selected' : ''}`} onClick={() => onToggleFavorite(channel)} aria-label={favorite ? t('channels.removeFavorite') : t('channels.addFavorite')}>
              <Heart size={19} fill={favorite ? 'currentColor' : 'none'} />
            </button>
          </article>
        )
      })}
      {limit < channels.length && (
        <button className="load-more" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
          {t('channels.showMore', { count: Math.min(PAGE_SIZE, channels.length - limit) })}
          <span>{t('channels.of', { shown: limit.toLocaleString(), total: channels.length.toLocaleString() })}</span>
        </button>
      )}
    </div>
  )
}
