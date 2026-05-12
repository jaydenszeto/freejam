import type { QueueTrack } from "./types";

export function isAllowedTrackUri(uri: string | null | undefined): uri is string {
  if (typeof uri !== "string") return false;
  return uri.startsWith("spotify:track:") || uri.startsWith("spotify:episode:");
}

// DOM-driven adapter for the Spotify Web Player at open.spotify.com.
// Read: walks React fiber from [data-testid="now-playing-widget"] (track URI,
// metadata) + parses playbar DOM (position, play/pause state).
// Write: synthesizes clicks on data-testid buttons and the progress bar; for
// playUri, hijacks an existing SPA anchor's href so React Router's delegated
// click handler navigates without a full page reload.

type AnyEl = HTMLElement | null;

function $(sel: string): AnyEl {
  return document.querySelector(sel) as AnyEl;
}

// Spicetify (and parts of the web player's metadata) sometimes returns image
// references in the `spotify:image:HASH` URI scheme, which the browser can't
// load. Map them to the public CDN URL.
export function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("spotify:image:")) {
    return "https://i.scdn.co/image/" + url.slice("spotify:image:".length);
  }
  return url;
}

function fiberOf(el: Element | null): any | null {
  if (!el) return null;
  const k = Object.keys(el).find((x) => x.startsWith("__reactFiber$"));
  return k ? (el as any)[k] : null;
}

// Walk fiber ancestors looking for memoizedProps that satisfy `pick`.
function findFiberProp<T>(
  el: Element | null,
  pick: (props: any, depth: number) => T | null,
  maxDepth = 40,
): T | null {
  let fiber = fiberOf(el);
  let depth = 0;
  while (fiber && depth < maxDepth) {
    const p = fiber.memoizedProps || fiber.pendingProps;
    if (p && typeof p === "object") {
      try {
        const r = pick(p, depth);
        if (r) return r;
      } catch {
        /* keep walking */
      }
    }
    fiber = fiber.return;
    depth++;
  }
  return null;
}

export function isReady(): boolean {
  // Wait until the playbar is mounted and React is hydrated.
  const pb = $('[data-testid="control-button-playpause"]');
  if (!pb) return false;
  const widget = $('[data-testid="now-playing-widget"]');
  if (!widget) return false;
  return !!fiberOf(widget);
}

type NowPlaying = {
  uri: string | null;
  name: string | null;
  artist: string | null;
  duration_ms: number | null;
  image_url: string | null;
};

function readNowPlaying(): NowPlaying {
  const widget = $('[data-testid="now-playing-widget"]');
  const r = findFiberProp(widget, (props) => {
    if (!props.state || typeof props.state !== "object") return null;
    const item = props.state.item;
    if (!item || typeof item.uri !== "string" || !item.uri.startsWith("spotify:")) return null;
    return item;
  });
  if (!r) return { uri: null, name: null, artist: null, duration_ms: null, image_url: null };
  const artists = Array.isArray(r.artists) ? r.artists.map((a: any) => a?.name).filter(Boolean) : [];
  const images = Array.isArray(r.images) ? r.images : [];
  const cover =
    images.find((i: any) => i.height >= 300) ?? images[images.length - 1] ?? images[0] ?? null;
  return {
    uri: r.uri,
    name: typeof r.name === "string" ? r.name : null,
    artist: artists.length > 0 ? artists.join(", ") : null,
    duration_ms: typeof r.duration === "number" ? r.duration : null,
    image_url: normalizeImageUrl(cover?.url ?? null),
  };
}

export function currentTrackUri(): string | null {
  const np = readNowPlaying();
  if (!np.uri) return null;
  // Ads surface as spotify:ad:... — we don't want to broadcast those.
  if (np.uri.startsWith("spotify:ad:")) return null;
  return np.uri;
}

export function currentTrackMeta(): NowPlaying {
  return readNowPlaying();
}

function parseTime(text: string | null | undefined): number {
  if (!text) return 0;
  const parts = text.trim().split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  let secs = 0;
  for (const n of parts) secs = secs * 60 + n;
  return secs * 1000;
}

export function progressMs(): number {
  const text = $('[data-testid="playback-position"]')?.textContent ?? "";
  return parseTime(text);
}

export function durationMs(): number {
  const meta = readNowPlaying();
  if (meta.duration_ms) return meta.duration_ms;
  const text = $('[data-testid="playback-duration"]')?.textContent ?? "";
  return parseTime(text);
}

export function isPlaying(): boolean {
  const btn = $('[data-testid="control-button-playpause"]');
  if (!btn) return false;
  // aria-label is "Pause" when currently playing (clicking pauses), "Play" when paused.
  const label = btn.getAttribute("aria-label") || "";
  return /pause/i.test(label);
}

function clickPlayPause(): void {
  const btn = $('[data-testid="control-button-playpause"]');
  if (!btn) return;
  btn.click();
}

export function play(): void {
  if (!isPlaying()) clickPlayPause();
}

export function pause(): void {
  if (isPlaying()) clickPlayPause();
}

export function next(): void {
  $('[data-testid="control-button-skip-forward"]')?.click();
}

export function previous(): void {
  $('[data-testid="control-button-skip-back"]')?.click();
}

export function seek(positionMs: number): void {
  const pbar = $('[data-testid="playback-progressbar"]');
  if (!pbar) return;
  const total = durationMs();
  if (total <= 0) return;
  const ratio = Math.max(0, Math.min(1, positionMs / total));
  const rect = pbar.getBoundingClientRect();
  if (rect.width < 4) return;
  const x = rect.left + rect.width * ratio;
  const y = rect.top + rect.height / 2;
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerType: "mouse" };
  // Spotify uses pointerdown/up on the progress bar for seek.
  pbar.dispatchEvent(new PointerEvent("pointerdown", { ...opts, pointerId: 1 } as any));
  pbar.dispatchEvent(new PointerEvent("pointerup", { ...opts, pointerId: 1 } as any));
  // Fallback to mouse events in case Spotify wires only those.
  pbar.dispatchEvent(new MouseEvent("mousedown", opts));
  pbar.dispatchEvent(new MouseEvent("mouseup", opts));
  pbar.dispatchEvent(new MouseEvent("click", opts));
}

function trackIdFromUri(uri: string): string | null {
  const m = uri.match(/^spotify:(track|episode):([A-Za-z0-9]+)/);
  return m ? m[2] : null;
}

function trackPath(uri: string): string | null {
  const m = uri.match(/^spotify:(track|episode):([A-Za-z0-9]+)/);
  if (!m) return null;
  return `/${m[1]}/${m[2]}`;
}

async function waitFor<T>(probe: () => T | null, timeoutMs = 3000, stepMs = 80): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = probe();
    if (v) return v;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return null;
}

// Navigate the SPA without a full reload. We can't hijack an existing anchor
// because React Router reads `to` from props, not the live DOM href. Instead,
// push the new path onto window.history and dispatch a popstate event —
// React Router's listener picks it up and re-renders the matched route.
function spaNavigate(path: string): boolean {
  try {
    history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return true;
  } catch (e) {
    console.warn("[FreeJam] spaNavigate failed", e);
    return false;
  }
}

// Track in-flight playUri attempts so beacon retries don't pile up while
// the SPA navigation is still resolving. `lastSuccessAt` is what gates the
// debounce — failed attempts don't update it, so the next beacon retries
// rather than waiting out a debounce on a no-op.
let pendingUri: string | null = null;
let pendingPromise: Promise<boolean> | null = null;
let lastSuccessUri: string | null = null;
let lastSuccessAt = 0;
const DEBOUNCE_MS = 4000;

export function playUri(uri: string): Promise<boolean> {
  if (!uri || !uri.startsWith("spotify:")) return Promise.resolve(false);
  if (pendingPromise && pendingUri === uri) return pendingPromise;
  const now = Date.now();
  if (uri === lastSuccessUri && now - lastSuccessAt < DEBOUNCE_MS) {
    return Promise.resolve(true);
  }
  pendingUri = uri;
  pendingPromise = playUriInner(uri).finally(() => {
    pendingUri = null;
    pendingPromise = null;
  });
  return pendingPromise;
}

async function playUriInner(uri: string): Promise<boolean> {
  if (currentTrackUri() === uri) {
    play();
    lastSuccessUri = uri;
    lastSuccessAt = Date.now();
    return true;
  }

  const path = trackPath(uri);
  if (!path) {
    console.warn("[FreeJam] cannot play unknown URI form", uri);
    return false;
  }

  const restorePath = location.pathname + location.search;
  if (!spaNavigate(path)) {
    console.warn("[FreeJam] spaNavigate failed; using hard navigation");
    location.assign(path);
    return false;
  }

  // Wait for React Router to render the new page, then locate the
  // action-bar play button. Predicate: an action-bar play-button exists
  // inside <main>, and its aria-label starts with "Play" or "Pause" so
  // we know the track-page content has populated (not a stale button
  // left over from the previous page).
  const playBtn = await waitFor<HTMLElement>(() => {
    const main = document.querySelector("main");
    if (!main) return null;
    const candidates = Array.from(
      main.querySelectorAll<HTMLElement>(
        '[data-testid="action-bar-row"] [data-testid="play-button"]',
      ),
    );
    for (const btn of candidates) {
      const label = btn.getAttribute("aria-label") || "";
      if (/^(play|pause)/i.test(label)) return btn;
    }
    return null;
  }, 5000, 100);

  if (!playBtn) {
    console.warn("[FreeJam] track page play button not found within 5s");
    // Don't update lastSuccessAt — let the next beacon retry.
    scheduleRestore(path, restorePath, 1500);
    return false;
  }

  const label = playBtn.getAttribute("aria-label") || "";
  if (/^play/i.test(label)) {
    playBtn.click();
  }
  // "Pause" means this track is already the active playback context —
  // nothing to click; we just confirmed it's playing.

  // Confirm playback actually started by polling the now-playing fiber.
  const started = await waitFor(
    () => (currentTrackUri() === uri ? true : null),
    3000,
    120,
  );
  if (started) {
    lastSuccessUri = uri;
    lastSuccessAt = Date.now();
  } else {
    console.warn("[FreeJam] click sent but track URI didn't switch within 3s");
  }

  scheduleRestore(path, restorePath, 1500);
  return !!started;
}

// Navigate the user back to where they were *only* if they're still on the
// track page we routed them to. If they navigated themselves in the
// meantime, leave them alone.
function scheduleRestore(navigatedPath: string, restorePath: string, delayMs: number): void {
  setTimeout(() => {
    if (location.pathname === navigatedPath && restorePath && restorePath !== navigatedPath) {
      spaNavigate(restorePath);
    }
  }, delayMs);
}

// --- Queue read (write is not supported on the web player) ---

export type QueueSnapshot = {
  queue: QueueTrack[];
  revision: string | null;
};

// Walk fiber from the queue page / now-playing panel to find the queue list.
function readQueueFromFiber(): QueueTrack[] {
  // The "Up next" list shows in the right sidebar when the user opens it.
  // We can't rely on its presence — instead, walk fiber from the playbar
  // looking for a nextTracks array.
  const widget = $('[data-testid="now-playing-widget"]');
  const queue = findFiberProp(widget, (props) => {
    const candidates = [props?.nextTracks, props?.queue, props?.upcoming];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0 && c[0]?.uri) return c;
    }
    // Also look in state.next / state.queue.
    const s = props?.state;
    if (s && Array.isArray(s.next) && s.next.length > 0 && s.next[0]?.uri) return s.next;
    return null;
  }, 30);
  if (!queue) return [];
  const out: QueueTrack[] = [];
  for (const item of queue.slice(0, 40)) {
    const uri = typeof item?.uri === "string" ? item.uri : null;
    if (!isAllowedTrackUri(uri)) continue;
    const artists = Array.isArray(item.artists) ? item.artists.map((a: any) => a?.name).filter(Boolean) : [];
    const images = Array.isArray(item.images) ? item.images : item.album?.images ?? [];
    const cover = images?.[0]?.url ?? null;
    out.push({
      uri,
      name: typeof item.name === "string" ? item.name : null,
      artist: artists.length > 0 ? artists.join(", ") : null,
      image_url: normalizeImageUrl(cover),
      duration_ms: typeof item.duration === "number" ? item.duration : null,
    });
  }
  return out;
}

export function currentQueueSnapshot(): QueueSnapshot {
  return { queue: readQueueFromFiber(), revision: null };
}

export async function replaceQueue(_queue: QueueTrack[]): Promise<boolean> {
  // Spotify Web Player has no programmatic "clear queue" — we can only
  // read what's in Up Next. Queue sync degrades to display-only on web.
  return false;
}

// --- Player event emulation ---

// The desktop Spicetify build wires Player.addEventListener("songchange") etc.
// The web player has no such API, so we poll the DOM/fiber for changes and
// emit synthetic events to keep peer.ts logic identical.
type Handler = () => void;
const listeners = new Map<string, Set<Handler>>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastTrack: string | null = null;
let lastPlaying: boolean | null = null;

export function addPlayerListener(event: string, handler: Handler): void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(handler);
  ensurePolling();
}

function emit(event: string): void {
  const set = listeners.get(event);
  if (!set) return;
  for (const h of set) {
    try {
      h();
    } catch (e) {
      console.error("[FreeJam] listener error", e);
    }
  }
}

function ensurePolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    const track = currentTrackUri();
    const playing = isPlaying();
    if (track !== lastTrack) {
      lastTrack = track;
      emit("songchange");
    }
    if (playing !== lastPlaying) {
      lastPlaying = playing;
      emit("onplaypause");
    }
  }, 300);
}
