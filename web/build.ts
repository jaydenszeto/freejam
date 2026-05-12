import { mkdirSync, existsSync, writeFileSync } from "node:fs";

const SERVER_URL = process.env.FREEJAM_SERVER || "wss://167-234-216-26.nip.io/ws";

if (!existsSync("dist")) mkdirSync("dist", { recursive: true });

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  target: "browser",
  format: "iife",
  minify: false,
  define: {
    __FREEJAM_SERVER__: JSON.stringify(SERVER_URL),
    __FREEJAM_VERSION__: JSON.stringify(process.env.FREEJAM_VERSION || "dev"),
  },
});

if (!result.success) {
  console.error("Build failed:");
  for (const m of result.logs) console.error(m);
  process.exit(1);
}

const text = await result.outputs[0].text();
const banner = `// FreeJam (web) — https://github.com/jaydenszeto/freejam\n// Server: ${SERVER_URL}\n// Paste into the Spotify web player console: open.spotify.com\n`;
const guarded = `if (window.__freejam_loaded) { console.log("[FreeJam] already loaded"); } else { window.__freejam_loaded = true;\n${text}\n}`;
writeFileSync("dist/freejam-web.js", banner + guarded);
console.log(
  `Built dist/freejam-web.js (${((banner.length + guarded.length) / 1024).toFixed(1)} KB) — server=${SERVER_URL}`,
);
