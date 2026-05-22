import { state, notifyState } from "./state";
import { sendMsg } from "./ws-client";
import { shouldSuppress } from "./echo-guard";
import { serverNow } from "./clock";
import {
  addPlayerListener,
  currentTrackUri,
  isAllowedTrackUri,
  isPlaying,
  progressMs,
} from "./spotify";
import { consumeIntent } from "./intent";

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

type Snap = { track_uri: string | null; position_ms: number; is_playing: boolean };

function snapshot(): Snap {
  return {
    track_uri: currentTrackUri(),
    position_ms: progressMs(),
    is_playing: isPlaying(),
  };
}

// Every user-initiated songchange is treated as an advance for the room —
// the user clicked play on a song, so the room follows. The old "smart
// hybrid" classifier had an off-queue branch that rolled the clicker back
// to the room track at its projected position (playUri(roomUri) → wait →
// seek(target)). That made every off-queue click feel like "the current
// song restarted at 0:00 and then jumped forward" — i.e. exactly the
// "click resets the current song" symptom users complained about.
//
// Pure "add to queue without playing" is still supported by Spotify's
// right-click → Add to queue: that path fires a queue diff but no
// songchange, so queue.ts's poll picks it up and broadcasts it without
// ever touching playback.
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

  // Drain any pending advance intent so it doesn't leak into a later
  // pushState (the True Shuffle path still calls markUserAdvance; the
  // intent is now redundant but harmless).
  consumeIntent(snap.track_uri);

  emitState(snap, now);
}

function emitState(snap: Snap, now: number): void {
  lastSentAt = now;
  lastSentTrack = snap.track_uri;
  lastSentPlaying = snap.is_playing;
  sendMsg({ t: "state", ...snap, sent_at: now });
  // Mirror the picker state locally so the UI and beacon checks see us as current.
  state.beacon_id = state.peer_id;
  state.current_track_uri = snap.track_uri;
  state.current_position_ms = snap.position_ms;
  state.current_is_playing = snap.is_playing;
  state.last_position_at_server = serverNow();
  notifyState();
}

function beaconTick(): void {
  if (!state.room_code) return;
  // Only beacon if we are the most recent picker.
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
