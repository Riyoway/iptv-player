import Hls from 'hls.js'
import { useEffect, useState, type RefObject } from 'react'
import type { PlaybackStatus } from '../types/iptv'

export function useHlsPlayer(
  videoRef: RefObject<HTMLVideoElement | null>,
  src?: string,
  forceHls = false,
  reloadToken = 0,
) {
  const [status, setStatus] = useState<PlaybackStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) {
      setStatus('idle')
      setError(null)
      return
    }

    let hls: Hls | null = null
    let disposed = false
    setError(null)
    setStatus('loading')

    const onReady = () => !disposed && setStatus('ready')
    const onError = () => {
      if (!disposed) {
        setStatus('error')
        setError('The stream could not be played. Check the URL, codec, CORS policy, or stream availability.')
      }
    }

    video.addEventListener('loadedmetadata', onReady)
    video.addEventListener('canplay', onReady)
    video.addEventListener('error', onError)

    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')
    const shouldUseHls = forceHls || /\.m3u8(?:$|[?#])/i.test(src)
    let managedByHls = false

    if (nativeHls && shouldUseHls) {
      video.src = src
    } else if (Hls.isSupported() && shouldUseHls) {
      managedByHls = true
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 30,
      })
      hls.attachMedia(video)
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls?.loadSource(src))
      hls.on(Hls.Events.MANIFEST_PARSED, () => setStatus('ready'))
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || !hls) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad()
          return
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError()
          return
        }
        setStatus('error')
        setError(data.details ? `Playback error: ${data.details}` : 'Fatal HLS playback error.')
      })
    } else {
      video.src = src
    }

    if (!managedByHls) video.load()

    return () => {
      disposed = true
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('error', onError)
      hls?.destroy()
    }
  }, [forceHls, reloadToken, src, videoRef])

  return { status, error }
}
