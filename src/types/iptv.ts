export type Channel = {
  id: string
  name: string
  url: string
  logo?: string
  group?: string
  groups?: string[]
  tvgId?: string
  sourceId?: string
  streamType?: 'hls' | 'direct'
  streamCheck?: StreamCheckResult
}

export type StreamCheckResult = {
  status: 'available' | 'unavailable' | 'unknown'
  checkedAt: number
  detail?: string
}

export type PlaylistSource = {
  id: string
  name: string
  kind: 'playlist' | 'single'
  origin: 'url' | 'file' | 'text'
  url?: string
  addedAt: number
  channels: Channel[]
}

export type ImportResult = {
  source: PlaylistSource
  detectedKind: 'playlist' | 'single'
}

export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'error'
