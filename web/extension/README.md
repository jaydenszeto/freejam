# FreeJam for web — Chrome extension

A tiny content-script wrapper that loads the FreeJam web bundle on every visit
to `open.spotify.com`. Optional — the [bookmarklet](https://167-234-216-26.nip.io/web)
and console-paste options work without installing anything.

## Install

1. Download or clone this directory.
2. Open `chrome://extensions` and turn on **Developer mode** (top-right).
3. Click **Load unpacked** and pick this `extension/` folder.
4. Open or refresh `open.spotify.com`. The FreeJam pill appears in the bottom-right.

## What it does

`loader.js` runs in the page's main world on every Spotify Web Player tab,
fetches the latest bundle from
`https://167-234-216-26.nip.io/web.js`, and evals it. The bundle is identical
to what you'd get via the bookmarklet — re-using the server-hosted file means
you never have to update the extension when the bundle changes.

## What it does *not* do

- No background page, no persistent storage, no network requests beyond the
  one fetch to the FreeJam server and the FreeJam WebSocket itself.
- No access to your Spotify cookies or account — the bundle is DOM-driven and
  doesn't read auth tokens.

## Files

- `manifest.json` — Manifest V3 declaration. `host_permissions` are
  not required because the content script targets a single match pattern.
- `loader.js` — Fetches and evaluates the FreeJam bundle.
- `icon-*.png` — Placeholder icons (not yet shipped — Chrome will use a
  default icon if these are missing).
