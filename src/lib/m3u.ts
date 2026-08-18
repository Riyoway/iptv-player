import type { Channel, ImportResult, PlaylistSource } from '../types/iptv'

const HLS_MANIFEST_MARKERS = [
  '#EXT-X-TARGETDURATION',
  '#EXT-X-MEDIA-SEQUENCE',
  '#EXT-X-STREAM-INF',
  '#EXT-X-I-FRAME-STREAM-INF',
  '#EXT-X-PLAYLIST-TYPE',
  '#EXT-X-ENDLIST',
  '#EXT-X-MAP',
  '#EXT-X-PART',
  '#EXT-X-SERVER-CONTROL',
]

const hash = (value: string) => {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export const makeId = (prefix: string, value = `${Date.now()}-${Math.random()}`) =>
  `${prefix}-${hash(value)}`

export const looksLikeHlsManifest = (content: string) =>
  HLS_MANIFEST_MARKERS.some((marker) => content.includes(marker))

export const looksLikeM3uPlaylist = (content: string) => {
  if (looksLikeHlsManifest(content)) return false
  if (content.includes('#EXTINF')) return true
  if (!content.trimStart().startsWith('#EXTM3U')) return false
  return content.split(/\r?\n/).some((line) => {
    const value = line.trim()
    return value.length > 0 && !value.startsWith('#')
  })
}

export const splitGroups = (value?: string) => [...new Set((value ?? '').split(';').map((group) => group.trim()).filter(Boolean))]

export const getChannelGroups = (channel: Pick<Channel, 'group' | 'groups'>) =>
  channel.groups?.length ? channel.groups : splitGroups(channel.group)

const parseAttributes = (line: string) => {
  const attrs: Record<string, string> = {}
  const matcher = /([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s,]*))/g
  for (const match of line.matchAll(matcher)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attrs
}

const extInfTitle = (line: string) => {
  let quote: string | null = null
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if ((char === '"' || char === "'") && line[i - 1] !== '\\') {
      quote = quote === char ? null : quote || char
      continue
    }
    if (char === ',' && !quote) return line.slice(i + 1).trim()
  }
  return ''
}

const resolveEntryUrl = (value: string, baseUrl?: string) => {
  if (!baseUrl) return value
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return value
  }
}

export const parseM3u = (content: string, sourceId = makeId('source'), baseUrl?: string): Channel[] => {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim())
  const channels: Channel[] = []
  let pending: Omit<Channel, 'id' | 'url' | 'sourceId'> | null = null

  for (const line of lines) {
    if (!line) continue

    if (line.startsWith('#EXTINF')) {
      const attrs = parseAttributes(line)
      const label = extInfTitle(line)
      const groups = splitGroups(attrs['group-title'])
      pending = {
        name: attrs['tvg-name'] || label || 'Untitled channel',
        logo: attrs['tvg-logo'] || undefined,
        group: groups[0],
        groups,
        tvgId: attrs['tvg-id'] || undefined,
      }
      continue
    }

    if (line.startsWith('#EXTGRP:') && pending) {
      const groups = splitGroups(line.slice('#EXTGRP:'.length))
      pending.group = pending.group || groups[0]
      pending.groups = pending.groups?.length ? pending.groups : groups
      continue
    }

    if (line.startsWith('#')) continue

    if (pending) {
      channels.push({
        ...pending,
        id: makeId('channel', `${sourceId}:${pending.tvgId ?? ''}:${line}:${pending.name}`),
        url: resolveEntryUrl(line, baseUrl),
        sourceId,
        streamType: /\.m3u8(?:$|[?#])/i.test(line) ? 'hls' : 'direct',
      })
      pending = null
      continue
    }

    const resolved = resolveEntryUrl(line, baseUrl)
    channels.push({
      id: makeId('channel', `${sourceId}:${line}`),
      name: titleFromUrl(resolved),
      url: resolved,
      sourceId,
      streamType: /\.m3u8(?:$|[?#])/i.test(line) ? 'hls' : 'direct',
    })
  }

  return channels
}

export const createImportResult = ({
  name,
  content,
  url,
  origin,
}: {
  name: string
  content?: string
  url?: string
  origin: PlaylistSource['origin']
}): ImportResult => {
  const sourceId = makeId('source', `${name}:${url ?? ''}:${Date.now()}`)

  if (content && looksLikeM3uPlaylist(content)) {
    const channels = parseM3u(content, sourceId, url)
    if (!channels.length) throw new Error('No playable entries were found in this playlist.')
    return {
      detectedKind: 'playlist',
      source: {
        id: sourceId,
        name,
        kind: 'playlist',
        origin,
        url,
        addedAt: Date.now(),
        channels,
      },
    }
  }

  const streamUrl = url
  if (!streamUrl) throw new Error('A single stream needs a URL.')

  const channel: Channel = {
    id: makeId('channel', `${sourceId}:${streamUrl}`),
    name,
    url: streamUrl,
    sourceId,
    streamType: content && looksLikeHlsManifest(content) ? 'hls' : /\.m3u8(?:$|[?#])/i.test(streamUrl) ? 'hls' : 'direct',
  }

  return {
    detectedKind: 'single',
    source: {
      id: sourceId,
      name,
      kind: 'single',
      origin,
      url,
      addedAt: Date.now(),
      channels: [channel],
    },
  }
}

export const titleFromUrl = (value: string) => {
  try {
    const url = new URL(value)
    const last = url.pathname.split('/').filter(Boolean).at(-1)
    return decodeURIComponent(last || url.hostname || 'Stream').replace(/\.(m3u8?|txt)$/i, '') || 'Stream'
  } catch {
    return 'Stream'
  }
}
