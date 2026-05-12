import type { PeerId, QueueTrack, RoomState } from "./types";
import { state, notifyState } from "./state";
import { sendMsg } from "./ws-client";
import { currentQueueSnapshot, replaceQueue } from "./spotify";

const POLL_MS = 1500;
const APPLY_SUPPRESS_MS = 5000;

let queueTimer: ReturnType<typeof setInterval> | null = null;
let lastLocalSig: string | null = null;
let lastPublishedSig: string | null = null;
let suppressLocalUntil = 0;

function queueSignature(queue: QueueTrack[]): string {
  return queue.map((track) => track.uri).join("\n");
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
  setTimeout(pollQueue, 500);
}

export function handleJoinedQueue(roomState: RoomState, isNewRoom: boolean): void {
  const queue = roomState.queue ?? [];
  setSharedQueue(
    queue,
    roomState.queue_revision ?? null,
    roomState.queue_recorded_at ?? 0,
    roomState.queue_beacon_id ?? null,
  );
  lastLocalSig = queueSignature(currentQueueSnapshot().queue);

  if (queue.length > 0 && roomState.queue_beacon_id && roomState.queue_beacon_id !== state.peer_id) {
    void applyQueue(queue);
    return;
  }

  if (isNewRoom && queue.length === 0) {
    setTimeout(() => publishLocalQueue(true), 600);
  }
}

export function handleRemoteQueue(msg: {
  origin_id: PeerId;
  queue: QueueTrack[];
  queue_revision: string | null;
  server_recv_at: number;
}): void {
  setSharedQueue(msg.queue, msg.queue_revision, msg.server_recv_at, msg.origin_id);
  if (msg.origin_id !== state.peer_id) void applyQueue(msg.queue);
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
  if (Date.now() < suppressLocalUntil) {
    lastLocalSig = sig;
    return;
  }
  if (sig !== lastLocalSig) {
    publishSnapshot(snap.queue, snap.revision, sig);
  }
}

function publishLocalQueue(force: boolean): void {
  const snap = currentQueueSnapshot();
  const sig = queueSignature(snap.queue);
  if (!force && sig === lastPublishedSig) return;
  publishSnapshot(snap.queue, snap.revision, sig);
}

function publishSnapshot(queue: QueueTrack[], revision: string | null, sig: string): void {
  if (!state.room_code) return;
  const now = Date.now();
  sendMsg({ t: "queue", queue, queue_revision: revision, sent_at: now });
  lastLocalSig = sig;
  setSharedQueue(queue, revision, now, state.peer_id);
  state.queue_error = null;
  notifyState();
}

async function applyQueue(queue: QueueTrack[]): Promise<void> {
  const targetSig = queueSignature(queue);
  const localSig = queueSignature(currentQueueSnapshot().queue);
  if (localSig === targetSig) {
    lastLocalSig = localSig;
    state.queue_error = null;
    notifyState();
    return;
  }

  suppressLocalUntil = Date.now() + APPLY_SUPPRESS_MS;
  const ok = await replaceQueue(queue);
  if (ok) {
    lastLocalSig = targetSig;
    state.queue_error = null;
  } else {
    state.queue_error = "Could not sync Spotify queue";
  }
  notifyState();
}
