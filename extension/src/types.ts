export type PeerId = string;
export type RoomCode = string;

export type ClientMsg =
  | { t: "hello"; peer_id?: PeerId }
  | { t: "create" }
  | { t: "join"; room_code: RoomCode }
  | { t: "leave" }
  | { t: "state"; track_uri: string | null; position_ms: number; is_playing: boolean; sent_at: number }
  | { t: "ping"; sent_at: number };

export type RoomState = {
  track_uri: string | null;
  position_ms: number;
  is_playing: boolean;
  position_recorded_at: number;
  beacon_id: PeerId | null;
};

export type ServerMsg =
  | { t: "hello_ack"; peer_id: PeerId }
  | { t: "created"; room_code: RoomCode }
  | { t: "joined"; room_code: RoomCode; state: RoomState; server_at: number; peers: PeerId[] }
  | {
      t: "state";
      origin_id: PeerId;
      track_uri: string | null;
      position_ms: number;
      is_playing: boolean;
      sent_at: number;
      server_recv_at: number;
    }
  | { t: "peer_join"; peer_id: PeerId }
  | { t: "peer_leave"; peer_id: PeerId }
  | { t: "pong"; client_sent_at: number; server_at: number }
  | { t: "error"; message: string };
