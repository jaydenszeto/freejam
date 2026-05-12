import { state } from "./state";
import { isWithinSuppress } from "./echo-guard";
import { serverNow } from "./clock";
import { currentTrackUri, isPlaying, progressMs, seek } from "./spotify";

let driftTimer: ReturnType<typeof setInterval> | null = null;

export function startDriftLoop(): void {
  if (driftTimer) clearInterval(driftTimer);
  driftTimer = setInterval(tick, 250);
}

function tick(): void {
  if (!state.room_code) return;
  if (isWithinSuppress()) return;
  // We don't drift-correct ourselves when we are the beacon.
  if (state.beacon_id === state.peer_id) return;
  if (!state.current_track_uri) return;

  const localUri = currentTrackUri();
  if (localUri !== state.current_track_uri) return; // apply.ts will sync the track first
  if (!state.current_is_playing) return;
  if (!isPlaying()) return;

  const elapsed = Math.max(0, serverNow() - state.last_position_at_server);
  const target = state.current_position_ms + elapsed;
  const local = progressMs();
  if (Math.abs(local - target) > 500) {
    seek(target);
  }
}
