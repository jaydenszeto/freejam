// Single-shot intent hint for the next `songchange` event.
//
// peer.ts's smart-hybrid classifier normally infers intent from whether the
// new track is in `state.shared_queue`. For programmatic transitions (e.g.
// True Shuffle calling Player.next() right after rewriting Spotify's queue),
// the shared queue snapshot is stale at the moment songchange fires — so we
// need an explicit hint to say "treat this as an advance, not an off-queue
// add". The hint is consumed by the next matching pushState call and cleared.

type Intent = "advance";

type Pending = { uri: string; intent: Intent; setAt: number } | null;
let pending: Pending = null;
const TTL_MS = 8000;

export function markUserAdvance(uri: string): void {
  if (typeof uri !== "string" || !uri) return;
  pending = { uri, intent: "advance", setAt: Date.now() };
}

export function consumeIntent(uri: string | null): Intent | null {
  if (!pending) return null;
  if (Date.now() - pending.setAt > TTL_MS) {
    pending = null;
    return null;
  }
  if (uri === pending.uri) {
    const out = pending.intent;
    pending = null;
    return out;
  }
  return null;
}
