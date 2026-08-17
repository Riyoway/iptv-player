# IPTV Player

A clean, responsive, local-first IPTV player for the web. Built with React, Vite, HeroUI v3, Tailwind CSS v4, and hls.js.

**Live URL:** https://iptv.riyo.me

## Features

- M3U and M3U8 support
- Content-based detection of IPTV playlists vs. standalone HLS manifests
- HLS playback with native browser support first and hls.js fallback
- Picture-in-Picture and fullscreen playback
- Custom player controls, volume, seeking, live indicator, retry, and stream URL copy
- Playlist metadata parsing (`tvg-name`, `tvg-logo`, `tvg-id`, `group-title`, and `EXTGRP`)
- Channel search and group filtering
- Multiple saved sources with source-level filtering and removal
- Favorites and recent playback history
- Local file import and raw M3U text import
- Large playlist persistence through IndexedDB, with lightweight favorites/history in `localStorage`
- Responsive Android-inspired interface with mobile bottom navigation, FAB, and bottom-sheet source import
- Progressive channel rendering for large playlists
- Keyboard controls: `Space`/`K` play-pause, `M` mute, `F` fullscreen, `P` Picture-in-Picture
- Installable PWA shell
- Vercel-ready configuration
- No backend, accounts, tracking, or playlist uploads

## Stack

- React 19
- TypeScript
- Vite
- HeroUI v3
- Tailwind CSS v4
- hls.js
- Lucide React
- Vitest

## Getting started

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build

```bash
npm run build
npm run preview
```

## Tests

```bash
npm test
```

## Deploy to Vercel

Import the repository into Vercel. The default Vite settings are enough; `vercel.json` already includes a few security-related response headers. No server runtime is required.

To use the intended domain, add `iptv.riyo.me` as a custom domain in the Vercel project and configure the DNS record requested by Vercel.

## How source detection works

IPTV Player checks playlist contents instead of relying only on the filename:

- A document with IPTV-style `#EXTINF` entries followed by channel URLs is treated as a **playlist**.
- A document containing HLS-specific tags such as `#EXT-X-TARGETDURATION`, `#EXT-X-MEDIA-SEQUENCE`, or `#EXT-X-STREAM-INF` is treated as a **single HLS stream manifest**.
- A direct `.m3u8` URL can be played as a single stream even when its manifest cannot be fetched ahead of time for detection.
- Extensionless IPTV playlist URLs are probed safely and parsed when the server allows browser access. Remote playlist imports are capped at 25 MB to avoid unbounded browser memory use.

## Browser and CORS notes

This project is intentionally client-side only. That means the browser must be allowed to access the stream or playlist.

- Remote M3U playlists need CORS headers that allow the web origin, otherwise the browser cannot read and parse them.
- An HTTPS deployment such as `https://iptv.riyo.me` cannot play plain HTTP streams because browsers block mixed content.
- hls.js playback also depends on the HLS server allowing the browser to request its manifest and media segments.
- Some IPTV streams use codecs, authentication, headers, cookies, DRM, or protocols that a normal HTML video element cannot play.
- Standalone local HLS manifest files are not opened as single streams because relative media segment paths lose their original server context. Use the original M3U8 URL instead.
- Picture-in-Picture support depends on the browser and operating system.

No public CORS proxy is bundled because routing private IPTV credentials or URLs through a third party would undermine the local-first design.

## Privacy

Playlist files are parsed in the browser. Saved sources are stored in IndexedDB; favorites and recent history are stored in `localStorage`. This project does not include analytics or a backend.

Remote stream servers will still receive normal network requests from your browser when you load their content.

## Project structure

```text
src/
├─ components/       UI and player components
├─ hooks/            HLS playback integration
├─ lib/              M3U parsing and local persistence
├─ types/            Shared TypeScript models
├─ App.tsx            Application state and source management
└─ styles.css         HeroUI/Tailwind imports and responsive UI
```

## Legal

IPTV Player does not provide, host, index, or bundle television channels or playlists. Users are responsible for ensuring they have permission to access the streams they load.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting a change.

## License

MIT. See [LICENSE](./LICENSE).
