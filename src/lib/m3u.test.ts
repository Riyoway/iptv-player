import { describe, expect, it } from 'vitest'
import { createImportResult, getChannelGroups, looksLikeHlsManifest, looksLikeM3uPlaylist, parseM3u } from './m3u'

const playlist = `#EXTM3U
#EXTINF:-1 tvg-id="one" tvg-name="Channel One" tvg-logo="https://example.com/one.png" group-title="News",One
https://example.com/one.m3u8
#EXTINF:-1 group-title="Music",Radio Two
https://example.com/two.m3u8`

const hls = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:1
#EXTINF:6.0,
segment-1.ts`

describe('M3U parser', () => {
  it('detects IPTV playlists', () => {
    expect(looksLikeM3uPlaylist(playlist)).toBe(true)
    expect(looksLikeHlsManifest(playlist)).toBe(false)
  })

  it('distinguishes HLS manifests from channel playlists', () => {
    expect(looksLikeHlsManifest(hls)).toBe(true)
    expect(looksLikeM3uPlaylist(hls)).toBe(false)
  })

  it('extracts channel metadata', () => {
    const channels = parseM3u(playlist, 'test')
    expect(channels).toHaveLength(2)
    expect(channels[0]).toMatchObject({
      name: 'Channel One',
      logo: 'https://example.com/one.png',
      group: 'News',
      tvgId: 'one',
      url: 'https://example.com/one.m3u8',
    })
  })

  it('creates a single source for a direct stream URL', () => {
    const result = createImportResult({
      name: 'Live',
      url: 'https://example.com/live.m3u8',
      origin: 'url',
    })
    expect(result.detectedKind).toBe('single')
    expect(result.source.channels).toHaveLength(1)
  })
})

describe('plain M3U compatibility', () => {
  it('parses URL-only M3U files', () => {
    const content = '#EXTM3U\nhttps://example.com/a.m3u8\nhttps://example.com/video.mp4'
    expect(looksLikeM3uPlaylist(content)).toBe(true)
    const channels = parseM3u(content, 'plain')
    expect(channels).toHaveLength(2)
    expect(channels[0].streamType).toBe('hls')
  })

  it('resolves relative IPTV entries against the playlist URL', () => {
    const content = '#EXTM3U\n#EXTINF:-1,Channel\nlive/channel.m3u8'
    const channels = parseM3u(content, 'relative', 'https://example.com/lists/main.m3u')
    expect(channels[0].url).toBe('https://example.com/lists/live/channel.m3u8')
  })

  it('splits semicolon-separated categories', () => {
    const channels = parseM3u('#EXTM3U\n#EXTINF:-1 group-title="Animation; Classic; Movies",Channel\nhttps://example.com/live.m3u8', 'multi')
    expect(getChannelGroups(channels[0])).toEqual(['Animation', 'Classic', 'Movies'])
  })
})
