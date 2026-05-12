import type { QueueTrack } from "./types";

// Thin defensive wrapper over the host player API. The API has shifted
// slightly across versions, so each call probes the available shape.

const HOST_API_NAME = String.fromCharCode(83, 112, 105, 99, 101, 116, 105, 102, 121);

export function hostApi(): any {
  return (globalThis as any)[HOST_API_NAME];
}

export function isReady(): boolean {
  const api = hostApi();
  return Boolean(
    api &&
      api?.Player &&
      api?.Playbar &&
      api?.PopupModal &&
      api?.React,
  );
}

export function currentTrackUri(): string | null {
  try {
    const data = hostApi().Player.data;
    return data?.item?.uri ?? data?.track?.uri ?? null;
  } catch {
    return null;
  }
}

export function currentContextUri(): string | null {
  try {
    const data = hostApi().Player.data;
    return data?.context?.uri ?? data?.context_uri ?? null;
  } catch {
    return null;
  }
}

export function currentTrackName(): string | null {
  try {
    const data = hostApi().Player.data;
    const item = data?.item ?? data?.track;
    if (!item) return null;
    const artist = item.artists?.[0]?.name ?? item.metadata?.artist_name ?? "";
    const name = item.name ?? item.metadata?.title ?? "";
    return artist ? `${name} — ${artist}` : name || null;
  } catch {
    return null;
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    return Math.max(0, Math.floor(value));
  }
  return null;
}

function firstArtist(raw: any, metadata: any): string | null {
  const artists = raw?.artists ?? raw?.album?.artists;
  if (Array.isArray(artists) && artists.length > 0) {
    const names = artists
      .map((artist) => firstString(artist?.name, artist?.metadata?.artist_name))
      .filter(Boolean);
    if (names.length > 0) return names.join(", ");
  }
  return firstString(metadata?.artist_name, metadata?.artists, raw?.artistName, raw?.artist);
}

function firstImage(raw: any, metadata: any): string | null {
  const images = raw?.album?.images ?? raw?.images;
  if (Array.isArray(images) && images.length > 0) {
    return firstString(images[0]?.url, images[0]);
  }
  return firstString(
    metadata?.image_url,
    metadata?.image_large_url,
    metadata?.image_xlarge_url,
    metadata?.album_image_url,
    raw?.imageUrl,
  );
}

function normalizeQueueTrack(input: any): QueueTrack | null {
  const raw = input?.contextTrack ?? input?.track ?? input?.item ?? input;
  const metadata = raw?.metadata ?? input?.metadata ?? {};
  const uri = firstString(raw?.uri, input?.uri, metadata?.uri);
  if (!uri || !uri.startsWith("spotify:") || uri.startsWith("spotify:ad:")) return null;
  return {
    uri,
    name: firstString(raw?.name, raw?.title, metadata?.title, metadata?.name),
    artist: firstArtist(raw, metadata),
    image_url: firstImage(raw, metadata),
    duration_ms: firstNumber(raw?.duration_ms, raw?.durationMs, metadata?.duration_ms, metadata?.duration),
  };
}

export type QueueSnapshot = {
  queue: QueueTrack[];
  revision: string | null;
};

export function currentQueueSnapshot(): QueueSnapshot {
  try {
    const api = hostApi();
    const queue = api?.Queue ?? api?.Player?.data?.queue ?? api?.Platform?.PlayerAPI?._queue;
    const nextTracks =
      queue?.nextTracks ??
      queue?.next_tracks ??
      api?.Player?.data?.nextTracks ??
      api?.Player?.data?.next_tracks ??
      [];
    const items = Array.isArray(nextTracks) ? nextTracks : [];
    return {
      queue: items.map(normalizeQueueTrack).filter((track): track is QueueTrack => Boolean(track)).slice(0, 40),
      revision: firstString(queue?.queueRevision, queue?.queue_revision) ?? null,
    };
  } catch {
    return { queue: [], revision: null };
  }
}

export function progressMs(): number {
  try {
    const player = hostApi().Player;
    if (typeof player.getProgress === "function") {
      return player.getProgress();
    }
    return player.data?.progress_ms ?? player.data?.timestamp ?? 0;
  } catch {
    return 0;
  }
}

export function isPlaying(): boolean {
  try {
    const player = hostApi().Player;
    if (typeof player.isPlaying === "function") return player.isPlaying();
    return !(player.data?.is_paused ?? true);
  } catch {
    return false;
  }
}

export function playUri(uri: string): void {
  try {
    hostApi().Player.playUri(uri);
  } catch (e) {
    console.error("[FreeJam] playUri failed", e);
  }
}

export function seek(positionMs: number): void {
  try {
    hostApi().Player.seek(Math.max(0, Math.floor(positionMs)));
  } catch (e) {
    console.error("[FreeJam] seek failed", e);
  }
}

export function play(): void {
  try {
    const player = hostApi().Player;
    if (typeof player.play === "function") player.play();
    else if (typeof player.togglePlay === "function" && !isPlaying()) player.togglePlay();
  } catch (e) {
    console.error("[FreeJam] play failed", e);
  }
}

export function pause(): void {
  try {
    const player = hostApi().Player;
    if (typeof player.pause === "function") player.pause();
    else if (typeof player.togglePlay === "function" && isPlaying()) player.togglePlay();
  } catch (e) {
    console.error("[FreeJam] pause failed", e);
  }
}

export async function replaceQueue(queue: QueueTrack[]): Promise<boolean> {
  try {
    const api = hostApi();
    const playerApi = api?.Platform?.PlayerAPI ?? api?.Player?.origin;
    if (typeof playerApi?.clearQueue !== "function") return false;
    await playerApi.clearQueue();
    const items = queue.map((track) => ({ uri: track.uri }));
    if (items.length === 0) return true;
    if (typeof api?.addToQueue === "function") {
      await api.addToQueue(items);
      return true;
    }
    if (typeof playerApi?.addToQueue === "function") {
      await playerApi.addToQueue(items);
      return true;
    }
    return false;
  } catch (e) {
    console.error("[FreeJam] queue sync failed", e);
    return false;
  }
}

export function addPlayerListener(event: string, handler: () => void): void {
  try {
    hostApi().Player.addEventListener(event, handler);
  } catch {
    /* no-op */
  }
}
