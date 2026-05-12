import type { QueueTrack } from "./types";
import { state, notifyState } from "./state";
import { sendMsg } from "./ws-client";
import { shouldSuppress, suppress } from "./echo-guard";
import { serverNow } from "./clock";
import {
  addPlayerListener,
  currentTrackMeta,
  currentTrackUri,
  hostApi,
  isAllowedTrackUri,
  isPlaying,
  pause,
  playUri,
  progressMs,
  seek,
} from "./spotify";
import { consumeIntent } from "./intent";
import { appendLocalQueueOptimistic } from "./queue";

let lastSentAt = 0;
let lastSentTrack: string | null = null;
let lastSentPlaying: boolean | null = null;
let beaconTimer: ReturnType<typeof setInterval> | null = null;

export function startPeer(): void {
  addPlayerListener("songchange", () => {
    void pushState(true);
  });
  addPlayerListener("onplaypause", () => {
    void pushState(true);
  });
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

// Smart-hybrid classifier.
//   Case A: no room track yet, or local matches the room track (play/pause
//           toggle, or replay of the current track) → broadcast state.
//   Case B: new track is already in the shared queue, OR an explicit advance
//           intent was marked (e.g. True Shuffle) → broadcast state. The
//           in-queue match means the user "advanced" the room rather than
//           starting fresh.
//   Case C: new track is NOT in the shared queue, room has a different
//           current track → append the new track to the room queue and roll
//           our local Spotify back to the room track. No state broadcast,
//           no one is interrupted.
async function pushState(force: boolean): Promise<void> {
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

  const intent = consumeIntent(snap.track_uri);
  const roomUri = state.current_track_uri;
  const inQueue =
    !!snap.track_uri && state.shared_queue.findIndex((t) => t.uri === snap.track_uri) >= 0;

  if (
    intent === "advance" ||
    !roomUri ||
    !snap.track_uri ||
    snap.track_uri === roomUri ||
    inQueue
  ) {
    emitState(snap, now);
    return;
  }

  // Case C — off-queue add.
  const meta = currentTrackMeta();
  if (!meta) {
    // Without metadata we can't materialise a queue entry; fall through to
    // the legacy interrupt path so the user isn't left with a broken click.
    emitState(snap, now);
    return;
  }
  await handleOffQueueAdd(meta, roomUri);
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

async function handleOffQueueAdd(meta: QueueTrack, roomUri: string): Promise<void> {
  appendLocalQueueOptimistic(meta);

  // Surgical insert on the originator — peers will sync via the broadcast
  // queue message and replaceQueue. Spicetify.addToQueue appends without
  // clobbering existing user-queued items.
  try {
    const api = hostApi();
    if (typeof api?.addToQueue === "function") {
      await api.addToQueue([{ uri: meta.uri }]);
    }
  } catch (e) {
    console.warn("[FreeJam] addToQueue failed", e);
  }

  await rollbackToRoomTrack(roomUri);

  try {
    hostApi()?.showNotification?.(`Added "${meta.name ?? "track"}" to room queue`);
  } catch {
    /* notification is best-effort */
  }
}

// Re-play the room's current track at the correctly-projected position so the
// user lands back where the room is. Mirrors the structure of applyRemoteState
// in apply.ts — same playUri/seek/pause sequencing.
async function rollbackToRoomTrack(roomUri: string): Promise<void> {
  const elapsed = Math.max(0, serverNow() - state.last_position_at_server);
  const target = state.current_is_playing
    ? state.current_position_ms + elapsed
    : state.current_position_ms;
  // Silence the songchange that the rollback's playUri will itself fire.
  suppress(roomUri, 2500);
  playUri(roomUri);
  await new Promise((r) => setTimeout(r, 450));
  seek(target);
  if (!state.current_is_playing) {
    await new Promise((r) => setTimeout(r, 100));
    pause();
  }
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
