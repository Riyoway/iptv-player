import { Button, Chip } from '@heroui/react'
import {
  AlertCircle,
  Copy,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  Radio,
  RotateCcw,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useHlsPlayer } from '../hooks/useHlsPlayer'
import { useSettings } from '../lib/i18n'
import type { Channel } from '../types/iptv'

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const secs = whole % 60
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    : `${minutes}:${secs.toString().padStart(2, '0')}`
}

const protocolIssue = (channel?: Channel) => {
  if (!channel) return null
  try {
    const parsed = new URL(channel.url)
    if (!['http:', 'https:', 'blob:'].includes(parsed.protocol)) {
      return `The ${parsed.protocol.replace(':', '').toUpperCase()} protocol cannot be played directly by a normal web browser.`
    }
    if (window.location.protocol === 'https:' && parsed.protocol === 'http:') {
      return 'This HTTP stream is blocked as mixed content because IPTV Player is running over HTTPS.'
    }
  } catch {
    return 'This channel has an invalid stream URL.'
  }
  return null
}

type SafariVideo = HTMLVideoElement & {
  webkitSupportsFullscreen?: boolean
  webkitDisplayingFullscreen?: boolean
  webkitEnterFullscreen?: () => void
  webkitExitFullscreen?: () => void
  webkitSupportsPresentationMode?: (mode: string) => boolean
  webkitSetPresentationMode?: (mode: string) => void
  webkitPresentationMode?: string
}

export function Player({ channel }: { channel?: Channel }) {
  const { t } = useSettings()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const playerRef = useRef<HTMLDivElement | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const issue = useMemo(() => protocolIssue(channel), [channel])
  const playableSrc = issue ? undefined : channel?.url
  const { status, error } = useHlsPlayer(videoRef, playableSrc, channel?.streamType === 'hls', reloadToken)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setReloadToken(0)
  }, [channel?.id])

  useEffect(() => {
    const video = videoRef.current as SafariVideo | null
    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement) || Boolean(video?.webkitDisplayingFullscreen))
    }

    document.addEventListener('fullscreenchange', syncFullscreenState)
    video?.addEventListener('webkitbeginfullscreen', syncFullscreenState)
    video?.addEventListener('webkitendfullscreen', syncFullscreenState)
    syncFullscreenState()

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
      video?.removeEventListener('webkitbeginfullscreen', syncFullscreenState)
      video?.removeEventListener('webkitendfullscreen', syncFullscreenState)
    }
  }, [channel?.id, videoRef])

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => setShowControls(false), 2600)
    return () => window.clearTimeout(timer)
  }, [playing, showControls])

  const togglePlay = async () => {
    const video = videoRef.current
    if (!video || issue) return
    try {
      if (video.paused) await video.play()
      else video.pause()
    } catch {
      setShowControls(true)
    }
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }

  const updateVolume = (value: number) => {
    const video = videoRef.current
    if (!video) return
    video.volume = value
    video.muted = value === 0
    setVolume(value)
    setMuted(value === 0)
  }

  const toggleFullscreen = async () => {
    const video = videoRef.current as SafariVideo | null
    const player = playerRef.current
    if (!video || !player) return

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }

      if (video.webkitDisplayingFullscreen) {
        video.webkitExitFullscreen?.()
        return
      }

      // iPhone Safari only exposes fullscreen for the video element, not its wrapper.
      if (video.webkitEnterFullscreen && video.webkitSupportsFullscreen !== false) {
        video.webkitEnterFullscreen()
        return
      }

      if (player.requestFullscreen) await player.requestFullscreen()
    } catch {
      setShowControls(true)
    }
  }

  const togglePip = async () => {
    const video = videoRef.current
    if (!video) return
    try {
      if ('pictureInPictureEnabled' in document && document.pictureInPictureEnabled) {
        if (document.pictureInPictureElement) await document.exitPictureInPicture()
        else if ('requestPictureInPicture' in video) await video.requestPictureInPicture()
        return
      }

      const safariVideo = video as SafariVideo
      if (safariVideo.webkitSupportsPresentationMode?.('picture-in-picture')) {
        safariVideo.webkitSetPresentationMode?.(
          safariVideo.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture',
        )
      }
    } catch {
      // Browsers can reject PiP because of policy, playback state, or user-gesture requirements.
    }
  }

  const copyUrl = async () => {
    if (!channel) return
    try {
      await navigator.clipboard.writeText(channel.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (key === ' ' || key === 'k') {
        event.preventDefault()
        void togglePlay()
      } else if (key === 'm') {
        toggleMute()
      } else if (key === 'f') {
        void toggleFullscreen()
      } else if (key === 'p') {
        void togglePip()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const seekable = Number.isFinite(duration) && duration > 0
  const live = channel && (!seekable || duration === Infinity)
  const playbackError = issue || error

  return (
    <section className="player-shell">
      <div
        ref={playerRef}
        className="player-surface"
        onMouseMove={() => setShowControls(true)}
        onMouseLeave={() => playing && setShowControls(false)}
        onDoubleClick={() => void toggleFullscreen()}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button, input')) return
          void togglePlay()
        }}
      >
        {channel ? (
          <video
            ref={videoRef}
            playsInline
            autoPlay
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          />
        ) : (
          <div className="player-empty">
            <div className="empty-play"><Play size={28} fill="currentColor" /></div>
            <strong>{t('player.nothingPlaying')}</strong>
            <span>{t('player.selectOrAdd')}</span>
          </div>
        )}

        {channel && !playbackError && status === 'loading' && (
          <div className="player-message">
            <span className="loader" />
            <span>{t('player.connecting')}</span>
          </div>
        )}

        {channel && playbackError && (
          <div className="player-message error-message">
            <AlertCircle size={26} />
            <strong>{t('player.unavailable')}</strong>
            <span>{playbackError}</span>
            {!issue && (
              <Button className="soft-button" onPress={() => setReloadToken((value) => value + 1)}>
                <RotateCcw size={16} /> {t('actions.retry')}
              </Button>
            )}
          </div>
        )}

        {channel && !issue && (
          <div className={`player-controls ${showControls || !playing ? 'visible' : ''}`}>
            <div className="player-gradient" />
            {seekable && (
              <input
                className="timeline"
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(currentTime, duration || 0)}
                aria-label={t('actions.seek')}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (videoRef.current) videoRef.current.currentTime = value
                  setCurrentTime(value)
                }}
              />
            )}
            <div className="controls-row">
              <div className="controls-left">
                <button className="icon-control primary-control" onClick={() => void togglePlay()} aria-label={playing ? t('actions.pause') : t('actions.play')}>
                  {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                </button>
                <button className="icon-control" onClick={toggleMute} aria-label={muted ? t('actions.unmute') : t('actions.mute')}>
                  {muted || volume === 0 ? <VolumeX size={20} /> : volume < 0.55 ? <Volume1 size={20} /> : <Volume2 size={20} />}
                </button>
                <input
                  className="volume-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  aria-label={t('actions.volume')}
                  onChange={(event) => updateVolume(Number(event.target.value))}
                />
                <span className="time-label">{live ? <><i className="live-dot" /> {t('player.live')}</> : `${formatTime(currentTime)} / ${formatTime(duration)}`}</span>
              </div>
              <div className="controls-right">
                <button className="icon-control" onClick={() => void copyUrl()} aria-label={t('actions.copyUrl')} title={copied ? t('actions.copied') : t('actions.copyUrl')}><Copy size={19} /></button>
                <button className="icon-control pip-control" onClick={() => void togglePip()} aria-label={t('actions.pictureInPicture')}><PictureInPicture2 size={20} /></button>
                <button className="icon-control" onClick={() => void toggleFullscreen()} aria-label={t('actions.fullscreen')}>
                  {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {channel && (
        <div className="now-playing-meta">
          <div className="channel-art compact-art">
            <Radio className="logo-fallback" size={20} />
            {channel.logo && <img src={channel.logo} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = 'none' }} />}
          </div>
          <div className="now-playing-text">
            <span>{t('player.nowPlaying')}</span>
            <strong>{channel.name}</strong>
          </div>
          {channel.group && <Chip className="group-pill" size="sm" variant="soft">{channel.group}</Chip>}
        </div>
      )}
    </section>
  )
}
