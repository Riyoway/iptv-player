import { Button, Chip } from '@heroui/react'
import {
  AlertCircle,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  Radio,
  RotateCcw,
  Square,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHlsPlayer } from '../hooks/useHlsPlayer'
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

type RecordableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

type RecordingDownload = {
  filename: string
  url: string
}

const recordingMimeTypes = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
]

const getRecordingMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return null
  return recordingMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null
}

const recordingFilename = (channelName: string, mimeType: string) => {
  const safeName = [...channelName]
    .map((character) => character.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(character) ? ' ' : character)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'IPTV recording'
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm'
  return `${safeName}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`
}

export function Player({ channel }: { channel?: Channel }) {
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
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDownload, setRecordingDownload] = useState<RecordingDownload | null>(null)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingUrlRef = useRef<string | null>(null)
  const recordingMimeType = useMemo(getRecordingMimeType, [])

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setReloadToken(0)
    setRecordingError(null)
  }, [channel?.id])

  const clearRecordingDownload = useCallback(() => {
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current)
    recordingUrlRef.current = null
    setRecordingDownload(null)
  }, [])

  const startRecording = useCallback(() => {
    const video = videoRef.current as RecordableVideo | null
    const activeRecorder = recorderRef.current
    if (!video || activeRecorder?.state === 'recording') return
    if (activeRecorder?.state === 'paused') {
      activeRecorder.resume()
      setIsRecording(true)
      return
    }
    if (!recordingMimeType) {
      setRecordingError('Recording is not supported in this browser.')
      return
    }

    let stream: MediaStream
    try {
      stream = video.captureStream?.() ?? video.mozCaptureStream?.() ?? (() => { throw new Error('captureStream is unavailable') })()
    } catch {
      setRecordingError('This stream cannot be recorded in the browser.')
      return
    }

    if (!stream.getTracks().length) {
      setRecordingError('The stream has no recordable media tracks.')
      return
    }

    try {
      const recorder = new MediaRecorder(stream, { mimeType: recordingMimeType })
      const recordingChunks: Blob[] = []
      const recordingChannelName = channel?.name ?? 'IPTV recording'
      clearRecordingDownload()
      setRecordingError(null)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunks.push(event.data)
      }
      recorder.onerror = () => {
        setIsRecording(false)
        setRecordingError('Recording stopped because the browser reported an error.')
      }
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((track) => track.stop())
        if (recorderRef.current === recorder) recorderRef.current = null
        setIsRecording(false)
        if (!recordingChunks.length) return
        const blob = new Blob(recordingChunks, { type: recorder.mimeType || recordingMimeType })
        const url = URL.createObjectURL(blob)
        recordingUrlRef.current = url
        setRecordingDownload({ filename: recordingFilename(recordingChannelName, recorder.mimeType || recordingMimeType), url })
      }
      recorder.start(1000)
      recorderRef.current = recorder
      setIsRecording(true)
    } catch {
      stream.getTracks().forEach((track) => track.stop())
      setRecordingError('Recording could not be started for this stream.')
    }
  }, [channel?.name, clearRecordingDownload, recordingMimeType])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    recorder.stop()
  }, [])

  const downloadRecording = useCallback(() => {
    if (!recordingDownload) return
    const anchor = document.createElement('a')
    anchor.href = recordingDownload.url
    anchor.download = recordingDownload.filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }, [recordingDownload])

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') recorder.stop()
    }
  }, [channel?.id])

  useEffect(() => {
    return () => {
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current)
    }
  }, [])

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

  const stopPlayback = () => {
    videoRef.current?.pause()
    stopRecording()
  }

  const handleVideoPlay = () => {
    setPlaying(true)
    startRecording()
  }

  const handleVideoPause = () => {
    setPlaying(false)
    const recorder = recorderRef.current
    if (recorder?.state === 'recording') recorder.pause()
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
            onPlay={handleVideoPlay}
            onPlaying={handleVideoPlay}
            onPause={handleVideoPause}
            onEnded={stopRecording}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          />
        ) : (
          <div className="player-empty">
            <div className="empty-play"><Play size={28} fill="currentColor" /></div>
            <strong>Nothing playing</strong>
            <span>Select a channel or add a stream to begin.</span>
          </div>
        )}

        {channel && !playbackError && status === 'loading' && (
          <div className="player-message">
            <span className="loader" />
            <span>Connecting to stream…</span>
          </div>
        )}

        {channel && playbackError && (
          <div className="player-message error-message">
            <AlertCircle size={26} />
            <strong>Playback unavailable</strong>
            <span>{playbackError}</span>
            {!issue && (
              <Button className="soft-button" onPress={() => setReloadToken((value) => value + 1)}>
                <RotateCcw size={16} /> Retry
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
                aria-label="Seek"
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (videoRef.current) videoRef.current.currentTime = value
                  setCurrentTime(value)
                }}
              />
            )}
            <div className="controls-row">
              <div className="controls-left">
                <button className="icon-control primary-control" onClick={() => void togglePlay()} aria-label={playing ? 'Pause' : 'Play'}>
                  {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                </button>
                {isRecording && (
                  <button className="icon-control recording-stop-control" onClick={stopPlayback} aria-label="Stop playback and finish recording" title="Stop and prepare download">
                    <Square size={17} fill="currentColor" />
                  </button>
                )}
                <button className="icon-control" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
                  {muted || volume === 0 ? <VolumeX size={20} /> : volume < 0.55 ? <Volume1 size={20} /> : <Volume2 size={20} />}
                </button>
                <input
                  className="volume-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  aria-label="Volume"
                  onChange={(event) => updateVolume(Number(event.target.value))}
                />
                <span className="time-label">
                  {isRecording && <><i className="recording-dot" /> REC</>}
                  {live ? <><i className="live-dot" /> LIVE</> : `${formatTime(currentTime)} / ${formatTime(duration)}`}
                </span>
              </div>
              <div className="controls-right">
                <button className="icon-control" onClick={() => void copyUrl()} aria-label="Copy stream URL" title={copied ? 'Copied' : 'Copy URL'}><Copy size={19} /></button>
                {recordingDownload && !isRecording && (
                  <button className="icon-control" onClick={downloadRecording} aria-label="Download recording" title="Download recording"><Download size={19} /></button>
                )}
                <button className="icon-control pip-control" onClick={() => void togglePip()} aria-label="Picture in picture"><PictureInPicture2 size={20} /></button>
                <button className="icon-control" onClick={() => void toggleFullscreen()} aria-label="Fullscreen">
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
            <span>Now playing</span>
            <strong>{channel.name}</strong>
          </div>
          {channel.group && <Chip className="group-pill" size="sm" variant="soft">{channel.group}</Chip>}
          {recordingError && <span className="recording-error" role="status">{recordingError}</span>}
          {recordingDownload && !isRecording && <button className="recording-download-button" onClick={downloadRecording}><Download size={15} /> Download</button>}
        </div>
      )}
    </section>
  )
}
