import { hostApi, currentContextUri } from "./spotify";
import { publishLocalQueue } from "./queue";
import { markUserAdvance } from "./intent";
import { state } from "./state";

// Uniform-random shuffle of the currently playing context.
//
// Spotify's native shuffle is anti-clustering (avoids repeating an artist/album
// back-to-back), which feels non-random on small lists. This module pulls the
// full context, applies Fisher-Yates, and writes the result into Spotify's
// internal queue using the same low-level setQueue technique the long-running
// shuffle+ extension uses — that's what lets us bypass the small addToQueue
// caps and the "Up Next from queue" UI indicator.

type Fetched = { uris: string[]; context: string | null };

async function fetchPlaylist(id: string, ctxUri: string): Promise<Fetched> {
  const api = hostApi();
  const res = await api.Platform.PlaylistAPI.getContents(`spotify:playlist:${id}`, { limit: 9999999 });
  const items: any[] = res?.items ?? [];
  const uris = items.filter((t) => t?.isPlayable !== false).map((t) => t.uri);
  return { uris, context: ctxUri };
}

async function fetchAlbum(ctxUri: string): Promise<Fetched> {
  const api = hostApi();
  const def = api?.GraphQL?.Definitions?.queryAlbumTracks;
  if (!def) throw new Error("Album shuffle needs GraphQL.queryAlbumTracks");
  const { data, errors } = await api.GraphQL.Request(def, { uri: ctxUri, offset: 0, limit: 500 });
  if (errors) throw new Error(errors[0]?.message ?? "Album fetch failed");
  const items: any[] = data?.albumUnion?.tracksV2?.items ?? data?.albumUnion?.tracks?.items ?? [];
  const uris = items
    .filter((i) => i?.track?.playability?.playable !== false)
    .map((i) => i.track.uri);
  return { uris, context: ctxUri };
}

async function fetchLikedSongs(ctxUri: string): Promise<Fetched> {
  const api = hostApi();
  const res = await api.CosmosAsync.get(
    "sp://core-collection/unstable/@/list/tracks/all?responseFormat=protobufJson",
  );
  const items: any[] = res?.item ?? [];
  const uris = items
    .filter((t) => t?.trackMetadata?.playable !== false)
    .map((t) => t.trackMetadata.link);
  return { uris, context: ctxUri };
}

async function fetchArtistTopTracks(ctxUri: string): Promise<Fetched> {
  const api = hostApi();
  const def = api?.GraphQL?.Definitions?.queryArtistOverview;
  if (!def) throw new Error("Artist shuffle needs GraphQL.queryArtistOverview");
  const locale = api?.Locale?.getLocale?.() ?? "en";
  const { data, errors } = await api.GraphQL.Request(def, {
    uri: ctxUri,
    locale,
    includePrerelease: false,
  });
  if (errors) throw new Error(errors[0]?.message ?? "Artist fetch failed");
  const items: any[] = data?.artistUnion?.discography?.topTracks?.items ?? [];
  const uris = items.map((i) => i.track.uri);
  return { uris, context: ctxUri };
}

async function fetchByContext(ctxUri: string): Promise<Fetched> {
  const api = hostApi();
  const uriObj = api?.URI?.fromString?.(ctxUri);
  const type: string | undefined = uriObj?.type;
  const id: string = uriObj?._base62Id ?? uriObj?.id ?? "";
  const category: string | undefined = uriObj?.category;

  if (type === "playlist" || type === "playlist-v2") return fetchPlaylist(id, ctxUri);
  if (type === "album") return fetchAlbum(ctxUri);
  if (type === "artist") return fetchArtistTopTracks(ctxUri);
  if (type === "collection" && category === "tracks") return fetchLikedSongs(ctxUri);
  // Liked-songs context URIs sometimes surface as spotify:user:<u>:collection
  if (ctxUri.includes(":collection")) return fetchLikedSongs(ctxUri);
  throw new Error(`Can't true-shuffle ${type ?? "this"} yet`);
}

function fisherYates<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}

function setInternalQueue(uris: string[], contextUri: string | null): void {
  const api = hostApi();
  const playerQueue = api?.Platform?.PlayerAPI?._queue;
  if (!playerQueue?._client?.setQueue) throw new Error("Spotify queue API unavailable");
  const { _queue, _client } = playerQueue;
  const prevTracks = _queue?.prevTracks ?? [];
  const queueRevision = _queue?.queueRevision;

  // The delimiter stops Spotify auto-continuing the context after our list ends.
  const nextTracks = [...uris, "spotify:delimiter"].map((uri) => ({
    contextTrack: { uri, uid: "", metadata: { is_queued: "false" } },
    removed: [],
    blocked: [],
    provider: "context",
  }));

  _client.setQueue({ nextTracks, prevTracks, queueRevision });

  if (contextUri) {
    try {
      const sessionId = api.Platform.PlayerAPI.getState?.()?.sessionId;
      if (sessionId) {
        api.Platform.PlayerAPI.updateContext(sessionId, {
          uri: contextUri,
          url: `context://${contextUri}`,
        });
      }
    } catch {
      /* updateContext is best-effort */
    }
  }
}

export type ShuffleResult = { ok: boolean; count: number; error?: string };

export async function trueShuffleCurrentContext(): Promise<ShuffleResult> {
  try {
    const api = hostApi();
    const ctxUri = currentContextUri();
    if (!ctxUri) return { ok: false, count: 0, error: "Nothing is playing" };

    const { uris, context } = await fetchByContext(ctxUri);
    if (uris.length === 0) return { ok: false, count: 0, error: "No playable tracks here" };

    const shuffled = fisherYates(uris);
    setInternalQueue(shuffled, context);

    // Tell FreeJam the new queue exists before the songchange fires — otherwise
    // peer.ts would classify the first-shuffled track as off-queue and roll it
    // back, undoing the shuffle. publishLocalQueue is a no-op when we're not
    // in a room.
    if (state.room_code) {
      publishLocalQueue(true);
      if (shuffled[0]) markUserAdvance(shuffled[0]);
    }

    api.Player.next();

    if (typeof api?.showNotification === "function") {
      api.showNotification(`True shuffled ${shuffled.length} track${shuffled.length === 1 ? "" : "s"}`);
    }
    return { ok: true, count: shuffled.length };
  } catch (e: any) {
    const message = e?.message ?? String(e);
    console.error("[FreeJam] trueShuffle failed", e);
    const api = hostApi();
    if (typeof api?.showNotification === "function") api.showNotification(message, true);
    return { ok: false, count: 0, error: message };
  }
}
