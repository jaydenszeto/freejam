import { state } from "./state";
import { isWithinSuppress } from "./echo-guard";
import { serverNow } from "./clock";
import { currentTrackUri, isPlaying, progressMs, seek } from "./spotify";

let driftTimer: ReturnType<typeof setInterval> | null = null;

export function startDriftLoop(): void {
  if (driftTimer) clearInterval(driftTimer);
  // 500ms cadence — DOM-driven progress reads are noisier and seeks here
  // are visible to the user, so we go a bit slower than the desktop build.
  driftTimer = setInterval(tick, 500);
}

function tick(): void {
  if (!state.room_code) return;
  if (isWithinSuppress()) return;
  if (state.beacon_id === state.peer_id) return;
  if (!state.current_track_uri) return;

  const localUri = currentTrackUri();
  if (localUri !== state.current_track_uri) return; // apply.ts handles track sync
  if (!state.current_is_playing) return;
  if (!isPlaying()) return;

  const elapsed = Math.max(0, serverNow() - state.last_position_at_server);
  const target = state.current_position_ms + elapsed;
  const local = progressMs();
  // Larger tolerance than desktop — text-parsed position is second-precision.
  if (Math.abs(local - target) > 1500) seek(target);
}
