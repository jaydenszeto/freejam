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

export function addPlayerListener(event: string, handler: () => void): void {
  try {
    hostApi().Player.addEventListener(event, handler);
  } catch {
    /* no-op */
  }
}
