import type { ClientMsg, ServerMsg } from "./types";
import { state, notifyState, persist } from "./state";
import { handleServerMsg } from "./apply";
import { onPong, sendPing } from "./clock";

declare const __FREEJAM_SERVER__: string;

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let pingInterval: ReturnType<typeof setInterval> | null = null;

export function connect(): void {
  const existing = state.ws;
  if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
    return;
  }
  state.status = "connecting";
  state.error = null;
  notifyState();

  const ws = new WebSocket(__FREEJAM_SERVER__);
  state.ws = ws;

  ws.addEventListener("open", () => {
    state.status = state.room_code ? "in_room" : "connected";
    reconnectDelay = 1000;
    notifyState();
    if (state.peer_id) sendMsg({ t: "hello", peer_id: state.peer_id });
    for (let i = 0; i < 4; i++) setTimeout(sendPing, i * 80);
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(sendPing, 30_000);
    if (state.room_code) sendMsg({ t: "join", room_code: state.room_code });
  });

  ws.addEventListener("message", (e) => {
    let msg: ServerMsg;
    try {
      msg = JSON.parse(typeof e.data === "string" ? e.data : "");
    } catch {
      return;
    }
    if (msg.t === "pong") {
      onPong(msg.client_sent_at, msg.server_at);
      return;
    }
    handleServerMsg(msg);
  });

  ws.addEventListener("close", () => {
    state.status = "disconnected";
    state.ws = null;
    notifyState();
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    state.error = "Connection error";
    notifyState();
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 1.6, 30_000);
    connect();
  }, reconnectDelay);
}

export function sendMsg(msg: ClientMsg): boolean {
  const ws = state.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
}

export function createRoom(): void {
  sendMsg({ t: "create" });
}

export function joinRoom(code: string): void {
  const c = code.trim().toUpperCase();
  if (!c) return;
  state.room_code = c;
  persist();
  sendMsg({ t: "join", room_code: c });
}

export function leaveRoom(): void {
  sendMsg({ t: "leave" });
  state.room_code = null;
  state.peers.clear();
  state.beacon_id = null;
  state.current_track_uri = null;
  state.current_is_playing = false;
  state.shared_queue = [];
  state.queue_revision = null;
  state.queue_recorded_at = 0;
  state.queue_beacon_id = null;
  state.queue_error = null;
  state.status = state.ws && state.ws.readyState === WebSocket.OPEN ? "connected" : "disconnected";
  persist();
  notifyState();
}
