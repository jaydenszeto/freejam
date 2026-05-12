// Thin defensive wrapper over Spicetify.Player. The API has shifted slightly
// across Spicetify versions, so each call probes the available shape.

declare const Spicetify: any;

export function isReady(): boolean {
  return Boolean(
    typeof Spicetify !== "undefined" &&
      Spicetify?.Player &&
      Spicetify?.Topbar &&
      Spicetify?.PopupModal &&
      Spicetify?.React,
  );
}

export function currentTrackUri(): string | null {
  try {
    const data = Spicetify.Player.data;
    return data?.item?.uri ?? data?.track?.uri ?? null;
  } catch {
    return null;
  }
}

export function currentTrackName(): string | null {
  try {
    const data = Spicetify.Player.data;
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
    if (typeof Spicetify.Player.getProgress === "function") {
      return Spicetify.Player.getProgress();
    }
    return Spicetify.Player.data?.progress_ms ?? Spicetify.Player.data?.timestamp ?? 0;
  } catch {
    return 0;
  }
}

export function isPlaying(): boolean {
  try {
    if (typeof Spicetify.Player.isPlaying === "function") return Spicetify.Player.isPlaying();
    return !(Spicetify.Player.data?.is_paused ?? true);
  } catch {
    return false;
  }
}

export function playUri(uri: string): void {
  try {
    Spicetify.Player.playUri(uri);
  } catch (e) {
    console.error("[FreeJam] playUri failed", e);
  }
}

export function seek(positionMs: number): void {
  try {
    Spicetify.Player.seek(Math.max(0, Math.floor(positionMs)));
  } catch (e) {
    console.error("[FreeJam] seek failed", e);
  }
}

export function play(): void {
  try {
    if (typeof Spicetify.Player.play === "function") Spicetify.Player.play();
    else if (typeof Spicetify.Player.togglePlay === "function" && !isPlaying()) Spicetify.Player.togglePlay();
  } catch (e) {
    console.error("[FreeJam] play failed", e);
  }
}

export function pause(): void {
  try {
    if (typeof Spicetify.Player.pause === "function") Spicetify.Player.pause();
    else if (typeof Spicetify.Player.togglePlay === "function" && isPlaying()) Spicetify.Player.togglePlay();
  } catch (e) {
    console.error("[FreeJam] pause failed", e);
  }
}

export function addPlayerListener(event: string, handler: () => void): void {
  try {
    Spicetify.Player.addEventListener(event, handler);
  } catch {
    /* no-op */
  }
}
