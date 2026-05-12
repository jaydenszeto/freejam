import type { ServerMsg } from "./types";
import { state, notifyState, persist } from "./state";
import { suppress } from "./echo-guard";
import { serverNow } from "./clock";
import { currentTrackUri, isPlaying, pause, play, playUri, progressMs, seek } from "./spotify";
import { handleJoinedQueue, handleRemoteQueue } from "./queue";

export function handleServerMsg(msg: ServerMsg): void {
  switch (msg.t) {
    case "hello_ack":
      state.peer_id = msg.peer_id;
      persist();
      notifyState();
      return;
    case "created":
      state.room_code = msg.room_code;
      state.status = "in_room";
      persist();
      notifyState();
      return;
    case "joined":
      state.room_code = msg.room_code;
      state.peers = new Set(msg.peers.filter((p) => p !== state.peer_id));
      state.beacon_id = msg.state.beacon_id;
      state.current_track_uri = msg.state.track_uri;
      state.current_position_ms = msg.state.position_ms;
      state.current_is_playing = msg.state.is_playing;
      state.last_position_at_server = msg.state.position_recorded_at;
      state.status = "in_room";
      state.error = null;
      persist();
      notifyState();
      handleJoinedQueue(msg.state, msg.peers.length <= 1);
      if (msg.state.track_uri && msg.state.beacon_id !== state.peer_id) {
        void applyRemoteState({
          track_uri: msg.state.track_uri,
          position_ms: msg.state.position_ms,
          is_playing: msg.state.is_playing,
          server_time_recorded: msg.state.position_recorded_at,
        });
      }
      return;
    case "state":
      state.beacon_id = msg.origin_id;
      state.current_track_uri = msg.track_uri;
      state.current_position_ms = msg.position_ms;
      state.current_is_playing = msg.is_playing;
      state.last_position_at_server = msg.server_recv_at;
      notifyState();
      if (msg.origin_id !== state.peer_id) {
        void applyRemoteState({
          track_uri: msg.track_uri,
          position_ms: msg.position_ms,
          is_playing: msg.is_playing,
          server_time_recorded: msg.server_recv_at,
        });
      }
      return;
    case "queue":
      handleRemoteQueue(msg);
      return;
    case "peer_join":
      state.peers.add(msg.peer_id);
      notifyState();
      return;
    case "peer_leave":
      state.peers.delete(msg.peer_id);
      notifyState();
      return;
    case "error":
      state.error = msg.message;
      // If our cached room code is invalid, drop back to the lobby so the
      // user sees the create/join UI instead of a half-broken in-room state.
      if (/not found/i.test(msg.message) && state.room_code) {
        state.room_code = null;
        state.peers.clear();
        state.beacon_id = null;
        state.current_track_uri = null;
        state.current_is_playing = false;
        state.shared_queue = [];
        state.status = state.ws && state.ws.readyState === WebSocket.OPEN ? "connected" : "disconnected";
        persist();
      }
      notifyState();
      return;
  }
}

async function applyRemoteState(s: {
  track_uri: string | null;
  position_ms: number;
  is_playing: boolean;
  server_time_recorded: number;
}): Promise<void> {
  if (!s.track_uri) return;
  const localUri = currentTrackUri();

  // Suppression must outlast the full apply latency for a track change
  // (SPA nav + click + playback confirmation + back-navigation ≈ 4-6s on
  // a fast connection). If suppression expires mid-apply the local
  // pollInterval will see "songchange", broadcast it back, and we get an
  // echo loop. Web is slower than desktop here, so be generous.
  const isTrackChange = localUri !== s.track_uri;
  suppress(s.track_uri, isTrackChange ? 10_000 : 3_000);

  if (isTrackChange) {
    const started = await playUri(s.track_uri);
    if (!started) return; // Next beacon will retry.
    // Recompute elapsed AFTER the (slow) navigation completed.
    const elapsed = Math.max(0, serverNow() - s.server_time_recorded);
    const targetPos = s.is_playing ? s.position_ms + elapsed : s.position_ms;
    if (targetPos > 1500) seek(targetPos);
    if (!s.is_playing) {
      await new Promise((r) => setTimeout(r, 200));
      pause();
    }
    return;
  }

  // Same track — reconcile position and play/pause.
  const elapsed = Math.max(0, serverNow() - s.server_time_recorded);
  const targetPos = s.is_playing ? s.position_ms + elapsed : s.position_ms;
  const localPos = progressMs();
  if (Math.abs(localPos - targetPos) > 1500) seek(targetPos);
  const localPlaying = isPlaying();
  if (s.is_playing && !localPlaying) play();
  else if (!s.is_playing && localPlaying) pause();
}
