import { connect } from "./ws-client";
import { startPeer } from "./peer";
import { startDriftLoop } from "./drift";
import { initUI } from "./ui";
import { isReady } from "./spotify";

declare const __FREEJAM_VERSION__: string;

async function main(): Promise<void> {
  let waited = 0;
  while (!isReady()) {
    await new Promise((r) => setTimeout(r, 100));
    waited += 100;
    if (waited > 30_000) {
      console.error("[FreeJam] Spotify host API never became ready; giving up.");
      return;
    }
  }
  console.log(`[FreeJam] starting (${__FREEJAM_VERSION__})`);
  initUI();
  connect();
  startPeer();
  startDriftLoop();
}

main();

export {};
