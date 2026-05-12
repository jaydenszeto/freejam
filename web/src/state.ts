import type { PeerId, QueueTrack, RoomCode } from "./types";

export type Status = "disconnected" | "connecting" | "connected" | "in_room";

export type State = {
  ws: WebSocket | null;
  peer_id: PeerId | null;
  room_code: RoomCode | null;
  peers: Set<PeerId>;
  status: Status;
  error: string | null;

  clock_offset_ms: number;

  beacon_id: PeerId | null;
  current_track_uri: string | null;
  current_position_ms: number;
  current_is_playing: boolean;
  last_position_at_server: number;

  shared_queue: QueueTrack[];
  queue_revision: string | null;
  queue_recorded_at: number;
  queue_beacon_id: PeerId | null;
  queue_error: string | null;
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
  shared_queue: [],
  queue_revision: null,
  queue_recorded_at: 0,
  queue_beacon_id: null,
  queue_error: null,
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

const STORAGE_KEY = "freejam-web.v1";

export function loadPersisted(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data?.peer_id === "string") state.peer_id = data.peer_id;
    if (typeof data?.room_code === "string") state.room_code = data.room_code;
  } catch {
    /* ignore */
  }
}

export function persist(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ peer_id: state.peer_id, room_code: state.room_code }),
    );
  } catch {
    /* ignore */
  }
}
