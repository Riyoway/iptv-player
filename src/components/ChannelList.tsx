import { Heart, Pencil, Play, Radio, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { Channel } from '../types/iptv'

const PAGE_SIZE = 200

export function ChannelList({
  channels,
  currentId,
  favorites,
  onPlay,
  onToggleFavorite,
  onRenameSource,
  onOpenContextMenu,
}: {
  channels: Channel[]
  currentId?: string
  favorites: Set<string>
  onPlay: (channel: Channel) => void
  onToggleFavorite: (channel: Channel) => void
  onRenameSource?: (sourceId: string) => void
  onOpenContextMenu?: (event: ReactMouseEvent<HTMLElement>, sourceId: string) => void
}) {
  const [limit, setLimit] = useState(PAGE_SIZE)

  useEffect(() => setLimit(PAGE_SIZE), [channels])

  if (!channels.length) {
    return (
      <div className="list-empty">
        <SearchX size={26} />
        <strong>No channels found</strong>
        <span>Try another search or group.</span>
      </div>
    )
  }

  const visible = channels.slice(0, limit)

  return (
    <div className="channel-list">
      {visible.map((channel) => {
        const active = channel.id === currentId
        const favorite = favorites.has(channel.id)
        return (
          <article
            key={channel.id}
            className={`channel-row ${active ? 'active' : ''}`}
            onContextMenuCapture={(event) => {
              if (channel.sourceId && onOpenContextMenu) onOpenContextMenu(event, channel.sourceId)
            }}
          >
            <button className="channel-main" onClick={() => onPlay(channel)}>
              <div className="channel-art">
                <Radio className="logo-fallback" size={20} />
                {channel.logo && <img src={channel.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = 'none' }} />}
                <span className="play-overlay"><Play size={17} fill="currentColor" /></span>
              </div>
              <div className="channel-copy">
                <strong>{channel.name}</strong>
                <span>{channel.group || 'Ungrouped'}</span>
              </div>
              {active && <span className="playing-badge"><i /> Playing</span>}
            </button>
            {channel.sourceId && onRenameSource && (
              <button className="channel-rename-button" onClick={() => onRenameSource(channel.sourceId!)} aria-label={`Rename source for ${channel.name}`}>
                <Pencil size={17} />
              </button>
            )}
            <button className={`favorite-button ${favorite ? 'selected' : ''}`} onClick={() => onToggleFavorite(channel)} aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}>
              <Heart size={19} fill={favorite ? 'currentColor' : 'none'} />
            </button>
          </article>
        )
      })}
      {limit < channels.length && (
        <button className="load-more" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, channels.length - limit)} more
          <span>{limit.toLocaleString()} of {channels.length.toLocaleString()}</span>
        </button>
      )}
    </div>
  )
}
