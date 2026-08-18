import type { StreamCheckResult } from '../types/iptv'

export type StreamCheckInput = { id: string; url: string }

export type StreamCheckProgress = {
  completed: number
  total: number
  result: StreamCheckResult
  id: string
}

const readProbeChunk = async (response: Response) => {
  if (!response.body) return
  const reader = response.body.getReader()
  try {
    await reader.read()
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

const checkOne = async (url: string, timeoutMs: number, parentSignal: AbortSignal): Promise<StreamCheckResult> => {
  const checkedAt = Date.now()
  if (parentSignal.aborted) throw new DOMException('Stream check cancelled', 'AbortError')
  let protocol = ''
  try {
    protocol = new URL(url).protocol
  } catch {
    return { status: 'unavailable', checkedAt, detail: 'Invalid URL' }
  }
  if (!/^https?:$/i.test(protocol)) {
    return { status: 'unavailable', checkedAt, detail: 'Unsupported URL scheme' }
  }

  const controller = new AbortController()
  const abort = () => controller.abort()
  parentSignal.addEventListener('abort', abort, { once: true })
  if (parentSignal.aborted) controller.abort()
  const timeout = setTimeout(abort, timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    if (!response.ok) return { status: 'unavailable', checkedAt, detail: `HTTP ${response.status}` }
    await readProbeChunk(response)
    return { status: 'available', checkedAt, detail: `HTTP ${response.status}` }
  } catch (error) {
    if (parentSignal.aborted) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { status: 'unknown', checkedAt, detail: 'Timed out or blocked by the browser' }
    }
    return { status: 'unknown', checkedAt, detail: 'The browser could not verify this stream' }
  } finally {
    clearTimeout(timeout)
    parentSignal.removeEventListener('abort', abort)
  }
}

export const checkStreams = async (
  inputs: StreamCheckInput[],
  { concurrency = 4, timeoutMs = 10000, signal, onProgress }: {
    concurrency?: number
    timeoutMs?: number
    signal?: AbortSignal
    onProgress?: (progress: StreamCheckProgress) => void
  } = {},
) => {
  const controller = signal ? undefined : new AbortController()
  const checkSignal = signal ?? controller!.signal
  const results = new Map<string, StreamCheckResult>()
  let nextIndex = 0
  let completed = 0

  const worker = async () => {
    while (nextIndex < inputs.length) {
      if (checkSignal.aborted) throw new DOMException('Stream check cancelled', 'AbortError')
      const input = inputs[nextIndex]
      nextIndex += 1
      const result = await checkOne(input.url, timeoutMs, checkSignal)
      results.set(input.id, result)
      completed += 1
      onProgress?.({ completed, total: inputs.length, result, id: input.id })
    }
  }

  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), inputs.length || 1) }, () => worker()))
  return results
}
