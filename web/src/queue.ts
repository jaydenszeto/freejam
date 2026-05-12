import type { PeerId, QueueTrack, RoomState } from "./types";
import { state, notifyState } from "./state";
import { sendMsg } from "./ws-client";
import { currentQueueSnapshot } from "./spotify";

// Web player can READ its local queue (from fiber) but cannot WRITE
// (no programmatic "clear queue" / "addToQueue" API without a Bearer
// token). The web build broadcasts its local queue when it changes, and
// displays the shared queue, but doesn't attempt to apply remote queues
// onto Spotify's internal queue. Desktop peers retain full queue sync.

const POLL_MS = 1800;

let queueTimer: ReturnType<typeof setInterval> | null = null;
let lastLocalSig: string | null = null;
let lastPublishedSig: string | null = null;

function queueSignature(queue: QueueTrack[]): string {
  return queue.map((t) => t.uri).join("\n");
}

function setSharedQueue(
  queue: QueueTrack[],
  revision: string | null,
  recordedAt: number,
  beaconId: PeerId | null,
): void {
  state.shared_queue = queue;
  state.queue_revision = revision;
  state.queue_recorded_at = recordedAt;
  state.queue_beacon_id = beaconId;
  lastPublishedSig = queueSignature(queue);
  notifyState();
}

export function startQueueSync(): void {
  if (queueTimer) clearInterval(queueTimer);
  lastLocalSig = queueSignature(currentQueueSnapshot().queue);
  queueTimer = setInterval(pollQueue, POLL_MS);
  setTimeout(pollQueue, 800);
}

export function handleJoinedQueue(roomState: RoomState, _isNewRoom: boolean): void {
  const queue = roomState.queue ?? [];
  setSharedQueue(
    queue,
    roomState.queue_revision ?? null,
    roomState.queue_recorded_at ?? 0,
    roomState.queue_beacon_id ?? null,
  );
  lastLocalSig = queueSignature(currentQueueSnapshot().queue);
  state.queue_error = queue.length > 0
    ? "Queue is read-only on web. Install on desktop to drive it — clicks on web still interrupt the room."
    : null;
  notifyState();
}

export function handleRemoteQueue(msg: {
  origin_id: PeerId;
  queue: QueueTrack[];
  queue_revision: string | null;
  server_recv_at: number;
}): void {
  setSharedQueue(msg.queue, msg.queue_revision, msg.server_recv_at, msg.origin_id);
  if (msg.origin_id !== state.peer_id && msg.queue.length > 0) {
    state.queue_error = "Queue is read-only on web. Install on desktop to drive it — clicks on web still interrupt the room.";
    notifyState();
  }
}

function pollQueue(): void {
  const snap = currentQueueSnapshot();
  const sig = queueSignature(snap.queue);
  if (!state.room_code) {
    lastLocalSig = sig;
    return;
  }
  if (lastLocalSig === null) {
    lastLocalSig = sig;
    return;
  }
  if (sig !== lastLocalSig && sig !== lastPublishedSig) {
    publishSnapshot(snap.queue, snap.revision, sig);
  }
}

function publishSnapshot(queue: QueueTrack[], revision: string | null, sig: string): void {
  if (!state.room_code) return;
  const now = Date.now();
  sendMsg({ t: "queue", queue, queue_revision: revision, sent_at: now });
  lastLocalSig = sig;
  setSharedQueue(queue, revision, now, state.peer_id);
}
