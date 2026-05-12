import { state, onStateChange } from "./state";
import { createRoom, joinRoom, leaveRoom } from "./ws-client";
import { normalizeImageUrl } from "./spotify";

// Floating overlay rendered as plain DOM (no host React on the web player).

const OVERLAY_ID = "freejam-overlay";
const PANEL_ID = "freejam-panel";
const TOGGLE_ID = "freejam-toggle";

let overlay: HTMLDivElement | null = null;
let panel: HTMLDivElement | null = null;
let panelOpen = false;
let joinCode = "";

export function initUI(): void {
  if (document.getElementById(OVERLAY_ID)) return;
  injectStyles();
  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  document.body.appendChild(overlay);
  renderToggle();
  renderPanel();
  onStateChange(rerender);
  rerender();
}

function injectStyles(): void {
  if (document.getElementById("freejam-style")) return;
  const s = document.createElement("style");
  s.id = "freejam-style";
  s.textContent = `
  #${OVERLAY_ID} {
    position: fixed;
    bottom: 96px;
    right: 16px;
    z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, sans-serif;
    color: #eee;
  }
  #${TOGGLE_ID} {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #1db954;
    color: #000;
    font-weight: 600;
    font-size: 13px;
    border: none;
    border-radius: 999px;
    padding: 8px 14px;
    cursor: pointer;
    box-shadow: 0 6px 16px rgba(0,0,0,0.35);
    transition: transform 0.08s ease;
  }
  #${TOGGLE_ID}:hover { transform: translateY(-1px); }
  #${TOGGLE_ID}[data-status="disconnected"] { background: #555; color: #ccc; }
  #${TOGGLE_ID}[data-status="connecting"] { background: #dca400; color: #000; }
  #${PANEL_ID} {
    position: absolute;
    right: 0;
    bottom: calc(100% + 10px);
    width: 320px;
    background: #121212;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.55);
    display: none;
  }
  #${PANEL_ID}.open { display: block; }
  .fj-status { font-size: 12px; color: #999; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .fj-dot { width: 8px; height: 8px; border-radius: 50%; background: #666; }
  .fj-dot.green { background: #1db954; }
  .fj-dot.yellow { background: #dca400; }
  .fj-h { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 4px; }
  .fj-sub { font-size: 12px; color: #888; margin: 0 0 12px; }
  .fj-error { font-size: 12px; color: #ff6464; margin-bottom: 10px; line-height: 1.4; }
  .fj-warn { font-size: 11px; color: #dca400; margin-bottom: 10px; line-height: 1.4; }
  .fj-code {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 0.2em;
    background: #1d1d1d;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    padding: 14px 10px;
    text-align: center;
    cursor: pointer;
    margin-bottom: 4px;
    user-select: all;
  }
  .fj-code:hover { background: #232323; }
  .fj-help { font-size: 11px; color: #666; text-align: center; margin-bottom: 14px; }
  .fj-track {
    font-size: 12px; color: #ccc; background: #161616; padding: 8px 10px;
    border-radius: 6px; margin-bottom: 12px; line-height: 1.4;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .fj-queue { background: #161616; border: 1px solid #232323; border-radius: 8px; overflow: hidden; margin-bottom: 12px; }
  .fj-queue-header { font-size: 12px; color: #aaa; padding: 8px 10px; border-bottom: 1px solid #232323; display: flex; justify-content: space-between; }
  .fj-queue-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-top: 1px solid #1a1a1a; }
  .fj-queue-row:first-child { border-top: none; }
  .fj-queue-cover { width: 28px; height: 28px; border-radius: 3px; background: #2a2a2a; object-fit: cover; flex: 0 0 auto; }
  .fj-queue-meta { min-width: 0; flex: 1; }
  .fj-queue-name { font-size: 12px; color: #eee; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fj-queue-artist { font-size: 11px; color: #777; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fj-queue-empty { color: #666; font-size: 12px; padding: 10px; }
  .fj-queue-more { color: #777; font-size: 11px; padding: 6px 10px; border-top: 1px solid #1a1a1a; }
  .fj-btn-primary {
    width: 100%; border: none; border-radius: 999px; padding: 10px 16px;
    font-weight: 600; font-size: 14px; cursor: pointer;
    background: #1db954; color: #000;
  }
  .fj-btn-primary:disabled { background: #2a2a2a; color: #555; cursor: not-allowed; }
  .fj-btn-ghost {
    width: 100%; border: 1px solid #2a2a2a; border-radius: 999px;
    padding: 8px 14px; font-size: 13px; cursor: pointer;
    background: transparent; color: #bbb;
  }
  .fj-or { text-align: center; color: #555; font-size: 11px; margin: 10px 0; }
  .fj-join-row { display: flex; gap: 6px; }
  .fj-input {
    flex: 1; background: #1d1d1d; color: #fff;
    border: 1px solid #2a2a2a; border-radius: 999px;
    padding: 10px 14px; font-family: ui-monospace, Menlo, monospace;
    letter-spacing: 0.18em; font-size: 14px; text-align: center;
    outline: none;
  }
  .fj-input:focus { border-color: #1db954; }
  .fj-join-btn {
    border: none; border-radius: 999px; padding: 10px 18px;
    font-weight: 600; font-size: 13px; cursor: pointer;
    background: #1db954; color: #000;
  }
  .fj-join-btn:disabled { background: #2a2a2a; color: #555; cursor: not-allowed; }
  `;
  document.head.appendChild(s);
}

function renderToggle(): void {
  if (!overlay) return;
  const btn = document.createElement("button");
  btn.id = TOGGLE_ID;
  btn.type = "button";
  btn.addEventListener("click", () => {
    panelOpen = !panelOpen;
    rerender();
  });
  overlay.appendChild(btn);
}

function renderPanel(): void {
  if (!overlay) return;
  panel = document.createElement("div");
  panel.id = PANEL_ID;
  overlay.appendChild(panel);
}

function statusText(): string {
  if (state.status === "in_room") {
    const total = state.peers.size + 1;
    return `${total} listener${total === 1 ? "" : "s"} in room`;
  }
  if (state.status === "connected") return "Connected";
  if (state.status === "connecting") return "Connecting…";
  return "Disconnected";
}

function dotClass(): string {
  if (state.status === "in_room" || state.status === "connected") return "fj-dot green";
  if (state.status === "connecting") return "fj-dot yellow";
  return "fj-dot";
}

function rerender(): void {
  const toggle = document.getElementById(TOGGLE_ID) as HTMLButtonElement | null;
  if (toggle) {
    toggle.setAttribute("data-status", state.status);
    const total = state.peers.size + 1;
    toggle.innerHTML = state.room_code
      ? `<span class="${dotClass()}"></span><span>FreeJam · ${escapeHtml(state.room_code)} · ${total}</span>`
      : `<span class="${dotClass()}"></span><span>FreeJam</span>`;
  }
  if (!panel) return;
  panel.classList.toggle("open", panelOpen);
  if (!panelOpen) return;
  panel.innerHTML = renderPanelBody();
  wirePanelHandlers();
}

function renderPanelBody(): string {
  const inRoom = !!state.room_code;
  const errorHtml = state.error
    ? `<div class="fj-error">${escapeHtml(state.error)}</div>`
    : "";
  const warnHtml = state.queue_error
    ? `<div class="fj-warn">${escapeHtml(state.queue_error)}</div>`
    : "";
  const statusHtml = `
    <div class="fj-status"><span class="${dotClass()}"></span><span>${escapeHtml(statusText())}</span></div>
    ${errorHtml}${warnHtml}
  `;

  if (inRoom) {
    const trackLine = state.current_track_uri
      ? `<div class="fj-track">${state.current_is_playing ? "♪" : "⏸"} ${escapeHtml(state.current_track_uri.replace("spotify:track:", "track ").slice(0, 28))}…</div>`
      : "";
    return `
      <div>${statusHtml}
        <div style="font-size:12px;color:#888;margin-bottom:6px">Room code</div>
        <div id="fj-room-code" class="fj-code">${escapeHtml(state.room_code || "")}</div>
        <div class="fj-help">Click to copy</div>
        ${trackLine}
        ${renderQueueHtml()}
        <button id="fj-leave" class="fj-btn-ghost" type="button">Leave room</button>
        <div style="font-size:11px;color:#555;margin-top:14px;line-height:1.5">
          Play music in Spotify like normal. Everyone in the room hears whatever anyone plays.
        </div>
      </div>
    `;
  }

  const code = escapeHtml(joinCode);
  const disabled = state.status === "disconnected";
  return `
    <div>
      <h1 class="fj-h">FreeJam</h1>
      <p class="fj-sub">Listen to Spotify with friends — on your own account.</p>
      ${statusHtml}
      <button id="fj-create" class="fj-btn-primary" type="button" ${disabled ? "disabled" : ""}>Start a Room</button>
      <div class="fj-or">or</div>
      <div class="fj-join-row">
        <input id="fj-code-input" class="fj-input" maxlength="6" placeholder="Code" value="${code}" autocomplete="off" autocapitalize="characters" />
        <button id="fj-join" class="fj-join-btn" type="button" ${joinCode.length < 4 || disabled ? "disabled" : ""}>Join</button>
      </div>
      <div style="font-size:11px;color:#555;margin-top:14px;line-height:1.5">
        Web player works with Free or Premium. Audio sync is best-effort — ads can desync.
      </div>
    </div>
  `;
}

function renderQueueHtml(): string {
  const head = `
    <div class="fj-queue-header">
      <span>Shared queue</span>
      <span>${state.shared_queue.length} track${state.shared_queue.length === 1 ? "" : "s"}</span>
    </div>`;
  if (state.shared_queue.length === 0) {
    return `<div class="fj-queue">${head}<div class="fj-queue-empty">No tracks queued</div></div>`;
  }
  const rows = state.shared_queue
    .slice(0, 6)
    .map((t) => {
      const cover = normalizeImageUrl(t.image_url);
      return `
    <div class="fj-queue-row">
      ${cover ? `<img class="fj-queue-cover" src="${escapeHtml(cover)}" referrerpolicy="no-referrer" />` : `<div class="fj-queue-cover"></div>`}
      <div class="fj-queue-meta">
        <div class="fj-queue-name">${escapeHtml(t.name ?? t.uri.replace("spotify:track:", "track "))}</div>
        ${t.artist ? `<div class="fj-queue-artist">${escapeHtml(t.artist)}</div>` : ""}
      </div>
    </div>`;
    })
    .join("");
  const remaining = state.shared_queue.length - 6;
  const more = remaining > 0 ? `<div class="fj-queue-more">+${remaining} more</div>` : "";
  return `<div class="fj-queue">${head}${rows}${more}</div>`;
}

function wirePanelHandlers(): void {
  document.getElementById("fj-create")?.addEventListener("click", () => createRoom());
  document.getElementById("fj-leave")?.addEventListener("click", () => leaveRoom());
  const input = document.getElementById("fj-code-input") as HTMLInputElement | null;
  if (input) {
    input.addEventListener("input", () => {
      joinCode = input.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
      input.value = joinCode;
      const joinBtn = document.getElementById("fj-join") as HTMLButtonElement | null;
      if (joinBtn) joinBtn.disabled = joinCode.length < 4 || state.status === "disconnected";
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && joinCode.length >= 4) joinRoom(joinCode);
    });
    input.focus();
  }
  document.getElementById("fj-join")?.addEventListener("click", () => {
    if (joinCode.length >= 4) joinRoom(joinCode);
  });
  const codeEl = document.getElementById("fj-room-code");
  if (codeEl && state.room_code) {
    codeEl.addEventListener("click", () => {
      navigator.clipboard?.writeText(state.room_code!).catch(() => {});
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === '"') return "&quot;";
    return "&#39;";
  });
}
