import { connect } from "./ws-client";
import { startPeer } from "./peer";
import { startDriftLoop } from "./drift";
import { startQueueSync } from "./queue";
import { initUI } from "./ui";
import { isReady } from "./spotify";
import { loadPersisted, state, notifyState } from "./state";

declare const __FREEJAM_VERSION__: string;

async function main(): Promise<void> {
  if (!location.host.endsWith("spotify.com")) {
    console.warn("[FreeJam] Not on open.spotify.com — aborting.");
    return;
  }
  loadPersisted();
  notifyState();

  let waited = 0;
  while (!isReady()) {
    await new Promise((r) => setTimeout(r, 250));
    waited += 250;
    if (waited > 30_000) {
      console.error("[FreeJam] Spotify web player never finished mounting; giving up.");
      return;
    }
  }
  console.log(`[FreeJam] starting on web (${__FREEJAM_VERSION__})`);
  initUI();
  connect();
  startPeer();
  startQueueSync();
  startDriftLoop();
  // If we had a previous room, the ws-client will auto-rejoin on open.
  if (state.room_code) console.log(`[FreeJam] auto-rejoining room ${state.room_code}`);
}

main();

export {};
