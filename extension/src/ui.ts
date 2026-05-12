import { state, onStateChange } from "./state";
import { createRoom, joinRoom, leaveRoom } from "./ws-client";
import { hostApi } from "./spotify";

let playbarButton: any = null;

export function initUI(): void {
  const api = hostApi();

  playbarButton = new api.Playbar.Button(
    "FreeJam",
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM6.4 5l4.6 3-4.6 3V5z"/></svg>`,
    () => openModal(),
  );

  const updateLabel = () => {
    if (!playbarButton) return;
    if (state.room_code) {
      const total = state.peers.size + 1;
      playbarButton.label = `FreeJam · ${state.room_code} · ${total}`;
    } else {
      playbarButton.label = "FreeJam";
    }
  };
  onStateChange(updateLabel);
  updateLabel();
}

function openModal(): void {
  const api = hostApi();
  const React = api.React;

  const Modal = () => {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => onStateChange(force), []);
    const [joinCode, setJoinCode] = React.useState("");

    const inRoom = !!state.room_code;
    const connectStatus =
      state.status === "in_room"
        ? `${state.peers.size + 1} listener${state.peers.size === 0 ? "" : "s"} in room`
        : state.status === "connected"
          ? "Connected"
          : state.status === "connecting"
            ? "Connecting…"
            : "Disconnected";

    const dot = React.createElement("span", {
      style: {
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background:
          state.status === "in_room" || state.status === "connected"
            ? "#1db954"
            : state.status === "connecting"
              ? "#dca400"
              : "#666",
        marginRight: 8,
      },
    });

    return React.createElement(
      "div",
      { style: { padding: "0.5rem 0", minWidth: "320px" } },
      React.createElement(
        "div",
        { style: { fontSize: "0.85rem", color: "#aaa", marginBottom: "0.9rem", display: "flex", alignItems: "center" } },
        dot,
        connectStatus,
      ),
      state.error
        ? React.createElement(
            "div",
            { style: { color: "#ff6464", marginBottom: "0.9rem", fontSize: "0.9rem" } },
            state.error,
          )
        : null,
      inRoom ? renderInRoom(React, joinCode, setJoinCode) : renderOutOfRoom(React, joinCode, setJoinCode),
      React.createElement(
        "div",
        { style: { marginTop: "1.5rem", fontSize: "0.78rem", color: "#666", lineHeight: 1.5 } },
        "Play music in Spotify like normal. Everyone in the room hears whatever anyone plays.",
      ),
    );
  };

  api.PopupModal.display({
    title: "FreeJam",
    content: React.createElement(Modal),
  });
}

function renderInRoom(React: any, joinCode: string, setJoinCode: (s: string) => void) {
  return React.createElement(
    "div",
    null,
    React.createElement("div", { style: { fontSize: "0.85rem", color: "#888", marginBottom: "0.4rem" } }, "Room code"),
    React.createElement(
      "div",
      {
        onClick: () => {
          if (state.room_code) navigator.clipboard?.writeText(state.room_code).catch(() => {});
        },
        title: "Click to copy",
        style: {
          fontFamily: "ui-monospace, Menlo, monospace",
          fontSize: "2rem",
          fontWeight: 600,
          background: "#1d1d1d",
          padding: "0.9rem 1rem",
          borderRadius: "10px",
          textAlign: "center",
          cursor: "pointer",
          letterSpacing: "0.2em",
          marginBottom: "0.4rem",
          border: "1px solid #2a2a2a",
        },
      },
      state.room_code,
    ),
    React.createElement(
      "div",
      { style: { fontSize: "0.78rem", color: "#666", textAlign: "center", marginBottom: "1.2rem" } },
      "Click to copy",
    ),
    state.current_track_uri
      ? React.createElement(
          "div",
          {
            style: {
              fontSize: "0.85rem",
              color: "#aaa",
              background: "#161616",
              padding: "0.6rem 0.8rem",
              borderRadius: "6px",
              marginBottom: "1rem",
            },
          },
          state.current_is_playing ? "♪ " : "⏸ ",
          state.current_track_uri.replace("spotify:track:", "track ").slice(0, 22) + "…",
        )
      : null,
    renderQueue(React),
    React.createElement("button", { onClick: () => leaveRoom(), style: ghostBtn() }, "Leave room"),
  );
}

function renderQueue(React: any) {
  const queue = state.shared_queue.slice(0, 8);
  const remaining = Math.max(0, state.shared_queue.length - queue.length);
  return React.createElement(
    "div",
    {
      style: {
        marginBottom: "1rem",
        background: "#161616",
        border: "1px solid #252525",
        borderRadius: "8px",
        overflow: "hidden",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          padding: "0.65rem 0.8rem",
          borderBottom: "1px solid #252525",
          fontSize: "0.82rem",
          color: "#aaa",
        },
      },
      React.createElement("span", null, "Shared queue"),
      React.createElement("span", null, `${state.shared_queue.length} track${state.shared_queue.length === 1 ? "" : "s"}`),
    ),
    state.queue_error
      ? React.createElement(
          "div",
          { style: { color: "#ff6464", fontSize: "0.78rem", padding: "0.65rem 0.8rem" } },
          state.queue_error,
        )
      : null,
    queue.length === 0
      ? React.createElement(
          "div",
          { style: { color: "#666", fontSize: "0.82rem", padding: "0.75rem 0.8rem" } },
          "No tracks queued",
        )
      : queue.map((track, i) =>
          React.createElement(
            "div",
            {
              key: `${track.uri}:${i}`,
              style: {
                display: "flex",
                alignItems: "center",
                gap: "0.65rem",
                padding: "0.55rem 0.8rem",
                borderTop: i === 0 && !state.queue_error ? "none" : "1px solid #222",
              },
            },
            track.image_url
              ? React.createElement("img", {
                  src: track.image_url,
                  style: { width: 32, height: 32, borderRadius: 4, objectFit: "cover", flex: "0 0 auto" },
                })
              : React.createElement("div", {
                  style: { width: 32, height: 32, borderRadius: 4, background: "#242424", flex: "0 0 auto" },
                }),
            React.createElement(
              "div",
              { style: { minWidth: 0, flex: 1 } },
              React.createElement(
                "div",
                {
                  style: {
                    color: "#eee",
                    fontSize: "0.86rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                },
                track.name ?? track.uri.replace("spotify:track:", "track "),
              ),
              track.artist
                ? React.createElement(
                    "div",
                    {
                      style: {
                        color: "#777",
                        fontSize: "0.76rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      },
                    },
                    track.artist,
                  )
                : null,
            ),
          ),
        ),
    remaining > 0
      ? React.createElement(
          "div",
          { style: { color: "#777", fontSize: "0.76rem", padding: "0.55rem 0.8rem", borderTop: "1px solid #222" } },
          `+${remaining} more`,
        )
      : null,
  );
}

function renderOutOfRoom(React: any, joinCode: string, setJoinCode: (s: string) => void) {
  return React.createElement(
    "div",
    null,
    React.createElement(
      "button",
      { onClick: () => createRoom(), style: primaryBtn(), disabled: state.status === "disconnected" },
      "Start a Room",
    ),
    React.createElement(
      "div",
      { style: { textAlign: "center", color: "#666", margin: "0.8rem 0", fontSize: "0.8rem" } },
      "or",
    ),
    React.createElement(
      "div",
      { style: { display: "flex", gap: "0.4rem" } },
      React.createElement("input", {
        type: "text",
        placeholder: "Code",
        value: joinCode,
        onChange: (e: any) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)),
        maxLength: 6,
        style: {
          flex: 1,
          background: "#1d1d1d",
          color: "#fff",
          border: "1px solid #2a2a2a",
          borderRadius: "999px",
          padding: "0.65rem 1rem",
          fontFamily: "ui-monospace, Menlo, monospace",
          letterSpacing: "0.18em",
          fontSize: "1rem",
          textAlign: "center",
        },
        autoFocus: true,
      }),
      React.createElement(
        "button",
        {
          onClick: () => {
            if (joinCode.length >= 4) joinRoom(joinCode);
          },
          style: primaryBtn(),
          disabled: joinCode.length < 4 || state.status === "disconnected",
        },
        "Join",
      ),
    ),
  );
}

function primaryBtn() {
  return {
    border: "none",
    borderRadius: "999px",
    padding: "0.7rem 1.3rem",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
    background: "#1db954",
    color: "#000",
    width: "auto",
    minWidth: "120px",
  } as any;
}

function ghostBtn() {
  return {
    border: "1px solid #333",
    borderRadius: "999px",
    padding: "0.6rem 1.2rem",
    fontSize: "0.9rem",
    fontWeight: 500,
    cursor: "pointer",
    background: "transparent",
    color: "#aaa",
    width: "100%",
  } as any;
}
