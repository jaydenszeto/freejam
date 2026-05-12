import type { ServerMsg } from "./types";
import { state, notifyState } from "./state";
import { suppress } from "./echo-guard";
import { serverNow } from "./clock";
import { currentTrackUri, isPlaying, pause, play, playUri, progressMs, seek } from "./spotify";
import { handleJoinedQueue, handleRemoteQueue } from "./queue";

export function handleServerMsg(msg: ServerMsg): void {
  switch (msg.t) {
    case "hello_ack":
      state.peer_id = msg.peer_id;
      notifyState();
      return;
    case "created":
      state.room_code = msg.room_code;
      state.status = "in_room";
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
      notifyState();
      handleJoinedQueue(msg.state, msg.peers.length <= 1);
      if (msg.state.track_uri && msg.state.beacon_id !== state.peer_id) {
        applyRemoteState({
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
        applyRemoteState({
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
  const elapsedSinceRecord = Math.max(0, serverNow() - s.server_time_recorded);
  const targetPos = s.is_playing ? s.position_ms + elapsedSinceRecord : s.position_ms;
  const localUri = currentTrackUri();

  suppress(s.track_uri, 1500);

  if (localUri !== s.track_uri) {
    playUri(s.track_uri);
    // Spotify needs a beat to start; then seek + maybe pause.
    await new Promise((r) => setTimeout(r, 450));
    seek(targetPos);
    if (!s.is_playing) {
      await new Promise((r) => setTimeout(r, 100));
      pause();
    }
    return;
  }

  // Same track — only seek if drift is significant, and reconcile play/pause.
  const localPos = progressMs();
  if (Math.abs(localPos - targetPos) > 500) seek(targetPos);
  const localPlaying = isPlaying();
  if (s.is_playing && !localPlaying) play();
  else if (!s.is_playing && localPlaying) pause();
}
