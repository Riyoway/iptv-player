import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkStreams } from './streamChecker'

describe('stream checker', () => {
  afterEach(() => vi.restoreAllMocks())

  it('marks successful HTTP responses as available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('stream-data', { status: 200 })))

    const results = await checkStreams([{ id: 'one', url: 'https://example.com/one.m3u8' }])

    expect(results.get('one')).toMatchObject({ status: 'available', detail: 'HTTP 200' })
  })

  it('marks HTTP errors as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))

    const results = await checkStreams([{ id: 'missing', url: 'https://example.com/missing.m3u8' }])

    expect(results.get('missing')).toMatchObject({ status: 'unavailable', detail: 'HTTP 404' })
  })

  it('keeps browser-blocked streams visible as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const results = await checkStreams([{ id: 'blocked', url: 'https://example.com/blocked.m3u8' }])

    expect(results.get('blocked')).toMatchObject({ status: 'unknown' })
  })
})
