import { state, notifyState } from "./state";
import { sendMsg } from "./ws-client";
import { shouldSuppress } from "./echo-guard";
import { serverNow } from "./clock";
import { addPlayerListener, currentTrackUri, isAllowedTrackUri, isPlaying, progressMs } from "./spotify";

let lastSentAt = 0;
let lastSentTrack: string | null = null;
let lastSentPlaying: boolean | null = null;
let beaconTimer: ReturnType<typeof setInterval> | null = null;

export function startPeer(): void {
  addPlayerListener("songchange", () => pushState(true));
  addPlayerListener("onplaypause", () => pushState(true));
  if (beaconTimer) clearInterval(beaconTimer);
  beaconTimer = setInterval(beaconTick, 2000);
}

function snapshot() {
  return {
    track_uri: currentTrackUri(),
    position_ms: progressMs(),
    is_playing: isPlaying(),
  };
}

function pushState(force: boolean): void {
  if (!state.room_code) return;
  const snap = snapshot();
  if (shouldSuppress(snap.track_uri)) return;
  if (snap.track_uri && !isAllowedTrackUri(snap.track_uri)) return;
  const now = Date.now();
  if (
    !force &&
    snap.track_uri === lastSentTrack &&
    snap.is_playing === lastSentPlaying &&
    now - lastSentAt < 500
  ) {
    return;
  }
  lastSentAt = now;
  lastSentTrack = snap.track_uri;
  lastSentPlaying = snap.is_playing;
  sendMsg({ t: "state", ...snap, sent_at: now });
  state.beacon_id = state.peer_id;
  state.current_track_uri = snap.track_uri;
  state.current_position_ms = snap.position_ms;
  state.current_is_playing = snap.is_playing;
  state.last_position_at_server = serverNow();
  notifyState();
}

function beaconTick(): void {
  if (!state.room_code) return;
  if (state.beacon_id !== state.peer_id) return;
  const snap = snapshot();
  if (shouldSuppress(snap.track_uri)) return;
  if (snap.track_uri && !isAllowedTrackUri(snap.track_uri)) return;
  if (!snap.is_playing) return;
  sendMsg({ t: "state", ...snap, sent_at: Date.now() });
  lastSentAt = Date.now();
  lastSentTrack = snap.track_uri;
  lastSentPlaying = snap.is_playing;
}
