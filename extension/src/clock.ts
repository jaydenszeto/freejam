import { sendMsg } from "./ws-client";
import { state } from "./state";

type Sample = { offset: number; rtt: number };
const samples: Sample[] = [];
const MAX_SAMPLES = 16;

export function sendPing(): void {
  sendMsg({ t: "ping", sent_at: Date.now() });
}

export function onPong(clientSentAt: number, serverAt: number): void {
  const now = Date.now();
  const rtt = now - clientSentAt;
  if (rtt < 0 || rtt > 5000) return;
  const offset = serverAt - (clientSentAt + rtt / 2);
  samples.push({ offset, rtt });
  if (samples.length > MAX_SAMPLES) samples.shift();
  // Median offset over the half of samples with lowest RTT.
  const lowRtt = [...samples].sort((a, b) => a.rtt - b.rtt).slice(0, Math.max(1, Math.floor(samples.length / 2)));
  lowRtt.sort((a, b) => a.offset - b.offset);
  state.clock_offset_ms = lowRtt[Math.floor(lowRtt.length / 2)].offset;
}

export function serverNow(): number {
  return Date.now() + state.clock_offset_ms;
}
