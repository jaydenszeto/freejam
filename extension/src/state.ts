import type { PeerId, RoomCode } from "./types";

export type Status = "disconnected" | "connecting" | "connected" | "in_room";

export type State = {
  ws: WebSocket | null;
  peer_id: PeerId | null;
  room_code: RoomCode | null;
  peers: Set<PeerId>;
  status: Status;
  error: string | null;

  // Clock sync
  clock_offset_ms: number;

  // Last known room playback state (from beacon)
  beacon_id: PeerId | null;
  current_track_uri: string | null;
  current_position_ms: number;
  current_is_playing: boolean;
  last_position_at_server: number;
};

export const state: State = {
  ws: null,
  peer_id: null,
  room_code: null,
  peers: new Set(),
  status: "disconnected",
  error: null,
  clock_offset_ms: 0,
  beacon_id: null,
  current_track_uri: null,
  current_position_ms: 0,
  current_is_playing: false,
  last_position_at_server: 0,
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function onStateChange(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function notifyState(): void {
  for (const l of listeners) {
    try {
      l();
    } catch (e) {
      console.error("[FreeJam] state listener error", e);
    }
  }
}
