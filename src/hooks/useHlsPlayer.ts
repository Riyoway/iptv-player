import Hls from 'hls.js'
import { useEffect, useState, type RefObject } from 'react'
import type { PlaybackStatus } from '../types/iptv'

const MAX_AUTO_RECOVERY_ATTEMPTS = 6
const RECOVERY_BASE_DELAY_MS = 1000
const RECOVERY_MAX_DELAY_MS = 30000

const recoveryDelay = (attempt: number) =>
  Math.min(RECOVERY_BASE_DELAY_MS * (2 ** attempt), RECOVERY_MAX_DELAY_MS)

const retryPolicy = (maxNumRetry: number, retryDelayMs = 1000) => ({
  maxNumRetry,
  retryDelayMs,
  maxRetryDelayMs: 10000,
  backoff: 'exponential' as const,
})

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
    let managedByHls = false
    let recoveryTimer: number | undefined
    let recoveryAttempts = 0
    let nativeStallTimer: number | undefined
    let nativeRecoveryAttempts = 0

    const clearRecoveryTimer = () => {
      if (recoveryTimer !== undefined) {
        window.clearTimeout(recoveryTimer)
        recoveryTimer = undefined
      }
    }

    const clearNativeStallTimer = () => {
      if (nativeStallTimer !== undefined) {
        window.clearTimeout(nativeStallTimer)
        nativeStallTimer = undefined
      }
    }

    const fail = (message: string) => {
      if (disposed) return
      setStatus('error')
      setError(message)
    }

    const setRecovering = () => {
      if (disposed) return
      setStatus('loading')
      setError(null)
    }

    const recoverNative = () => {
      if (disposed || managedByHls || video.ended) return
      if (nativeRecoveryAttempts >= MAX_AUTO_RECOVERY_ATTEMPTS) {
        fail('The stream stopped responding. Press Retry to reconnect.')
        return
      }

      nativeRecoveryAttempts += 1
      setRecovering()
      const resumePlayback = !video.paused
      const position = video.currentTime
      const onMetadata = () => {
        video.removeEventListener('loadedmetadata', onMetadata)
        if (Number.isFinite(video.duration) && Number.isFinite(position)) {
          try { video.currentTime = Math.min(position, video.duration) } catch { /* ignore seek failures during recovery */ }
        }
        if (resumePlayback) void video.play().catch(() => undefined)
      }

      video.addEventListener('loadedmetadata', onMetadata)
      video.src = src
      video.load()
    }

    const scheduleNativeRecovery = (immediate = false) => {
      if (disposed || managedByHls || video.ended || (video.paused && !immediate) || nativeStallTimer !== undefined) return
      nativeStallTimer = window.setTimeout(() => {
        nativeStallTimer = undefined
        recoverNative()
      }, immediate ? 0 : 8000)
    }

    const scheduleHlsRecovery = (kind: 'network' | 'media', details: string) => {
      if (disposed || !hls || recoveryTimer !== undefined) return
      if (recoveryAttempts >= MAX_AUTO_RECOVERY_ATTEMPTS) {
        fail('The stream stopped responding. Press Retry to reconnect.')
        return
      }

      const attempt = recoveryAttempts
      recoveryAttempts += 1
      setRecovering()
      recoveryTimer = window.setTimeout(() => {
        recoveryTimer = undefined
        if (disposed || !hls) return

        try {
          if (kind === 'media') {
            hls.recoverMediaError()
          } else if (hls.levels.length === 0 || details.startsWith('MANIFEST_')) {
            hls.loadSource(src)
          } else {
            hls.startLoad()
          }
        } catch {
          scheduleHlsRecovery(kind, details)
        }
      }, recoveryDelay(attempt))
    }

    setError(null)
    setStatus('loading')

    const onReady = () => !disposed && setStatus('ready')
    const onPlaying = () => {
      if (disposed) return
      clearNativeStallTimer()
      recoveryAttempts = 0
      nativeRecoveryAttempts = 0
      setStatus('ready')
      setError(null)
    }
    const onWaiting = () => scheduleNativeRecovery()
    const onStalled = () => scheduleNativeRecovery()
    const onError = () => {
      if (managedByHls) scheduleHlsRecovery('media', 'VIDEO_ERROR')
      else scheduleNativeRecovery(true)
    }

    video.addEventListener('loadedmetadata', onReady)
    video.addEventListener('canplay', onReady)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalled)
    video.addEventListener('error', onError)

    const shouldUseHls = forceHls || /\.m3u8(?:$|[?#])/i.test(src)
    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL')

    // Prefer HLS.js when MSE is available. Some mobile Chromium versions report
    // native HLS support via canPlayType() but fail to play the stream reliably.
    if (Hls.isSupported() && shouldUseHls) {
      managedByHls = true
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        manifestLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 10000,
            maxLoadTimeMs: 30000,
            timeoutRetry: retryPolicy(2),
            errorRetry: retryPolicy(5),
          },
        },
        playlistLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 10000,
            maxLoadTimeMs: 30000,
            timeoutRetry: retryPolicy(2),
            errorRetry: retryPolicy(5),
          },
        },
        fragLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 10000,
            maxLoadTimeMs: 120000,
            timeoutRetry: retryPolicy(3),
            errorRetry: retryPolicy(6),
          },
        },
      })
      hls.attachMedia(video)
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls?.loadSource(src))
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        recoveryAttempts = 0
        if (!disposed) setStatus('ready')
      })
      hls.on(Hls.Events.FRAG_LOADED, () => {
        recoveryAttempts = 0
        if (!disposed) setError(null)
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || !hls) return
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          scheduleHlsRecovery('network', data.details)
          return
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          scheduleHlsRecovery('media', data.details)
          return
        }
        fail(data.details ? `Playback error: ${data.details}` : 'Fatal HLS playback error.')
      })
    } else if (nativeHls && shouldUseHls) {
      video.src = src
    } else {
      video.src = src
    }

    if (!managedByHls) video.load()

    return () => {
      disposed = true
      clearRecoveryTimer()
      clearNativeStallTimer()
      video.pause()
      video.removeAttribute('src')
      video.load()
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onStalled)
      video.removeEventListener('error', onError)
      hls?.destroy()
    }
  }, [forceHls, reloadToken, src, videoRef])

  return { status, error }
}
