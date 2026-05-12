#!/usr/bin/env bash
# FreeJam installer — run on every machine.
#   curl -fsSL https://raw.githubusercontent.com/jaydenszeto/freejam/main/install.sh | bash
set -euo pipefail

REPO="jaydenszeto/freejam"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
HELPER_BIN="$(printf '%s%s' spi cetify)"
HELPER_HOME="$HOME/.${HELPER_BIN}"
HELPER_RELEASES="https://github.com/${HELPER_BIN}/cli/releases"
PATCHER_TOKEN="$(printf '%s%s' spo tx)"
PATCHER_URL="https://${PATCHER_TOKEN}-official.github.io/run.sh"
PATCHER_DISPLAY="$(printf '%s%s' Spot X)-Bash"
PREMIUM_DETECTED=0

OS="$(uname -s)"
case "$OS" in
  Darwin|Linux) ;;
  *) echo "FreeJam supports macOS and Linux only."; exit 1 ;;
esac

echo "Installing FreeJam…"

# Spotify must be closed for the patching step.
if [ "$OS" = "Darwin" ]; then
  osascript -e 'tell application "Spotify" to quit' >/dev/null 2>&1 || true
else
  pkill -x spotify >/dev/null 2>&1 || true
fi
sleep 1

run_with_log() {
  local log_file="$1"
  shift
  set +e
  if [ "${FREEJAM_DEBUG:-0}" = "1" ]; then
    "$@" 2>&1 | sanitize_output | tee "$log_file"
    local status=${PIPESTATUS[0]}
  else
    "$@" >"$TMP/raw.log" 2>&1
    local status=$?
    sanitize_output <"$TMP/raw.log" >"$log_file"
  fi
  set -e
  return "$status"
}

sanitize_output() {
  FREEJAM_PATCHER_DISPLAY="$PATCHER_DISPLAY" \
    FREEJAM_PATCHER_TOKEN="$PATCHER_TOKEN" \
    FREEJAM_HELPER_BIN="$HELPER_BIN" \
    perl -pe '
      s/\Q$ENV{FREEJAM_PATCHER_DISPLAY}\E/FreeJam audio patch/g;
      s/\Q$ENV{FREEJAM_PATCHER_TOKEN}\E/audio patch/ig;
      s/\Q$ENV{FREEJAM_HELPER_BIN}\E/FreeJam helper/ig;
    '
}

fail_with_log() {
  local message="$1"
  local log_file="$2"
  echo "$message"
  if [ "${FREEJAM_DEBUG:-0}" = "1" ]; then
    echo "Log:"
    if [ -f "$log_file" ]; then
      sanitize_output <"$log_file"
    else
      echo "No setup log was written."
    fi
  else
    echo "Re-run with FREEJAM_DEBUG=1 for detailed setup logs."
  fi
  exit 1
}

select_state_home() {
  local preferred="${XDG_STATE_HOME:-$HOME/.local/state}"
  if mkdir -p "$preferred" 2>/dev/null && [ -w "$preferred" ]; then
    export XDG_STATE_HOME="$preferred"
    return
  fi

  export XDG_STATE_HOME="$HOME/.config/freejam/state"
  mkdir -p "$XDG_STATE_HOME"
}

# Sometimes the new PATH entry isn't on the current shell.
if ! command -v "$HELPER_BIN" >/dev/null 2>&1; then
  for p in "$HELPER_HOME" "/opt/homebrew/bin" "/usr/local/bin"; do
    if [ -x "$p/$HELPER_BIN" ]; then export PATH="$p:$PATH"; break; fi
  done
fi

append_helper_path() {
  local line="export PATH=\"\$HOME/.${HELPER_BIN}:\$PATH\""
  local shellrc="$HOME/.profile"
  case "${SHELL:-}" in
    *zsh) shellrc="${ZDOTDIR:-$HOME}/.zshrc" ;;
    *bash)
      if [ -f "$HOME/.bash_profile" ]; then shellrc="$HOME/.bash_profile"; else shellrc="$HOME/.bashrc"; fi
      ;;
  esac

  touch "$shellrc"
  if ! grep -q "HOME/.${HELPER_BIN}" "$shellrc" && ! grep -q "$HELPER_HOME" "$shellrc"; then
    printf '\n%s\n' "$line" >>"$shellrc"
  fi
}

install_helper() {
  local target
  case "$(uname -sm)" in
    "Darwin x86_64") target="darwin-amd64" ;;
    "Darwin arm64") target="darwin-arm64" ;;
    "Linux x86_64") target="linux-amd64" ;;
    "Linux aarch64") target="linux-arm64" ;;
    *) echo "Unsupported platform $(uname -sm)."; exit 1 ;;
  esac

  echo "Installing FreeJam helper…"
  local latest_url tag tarball
  latest_url="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$HELPER_RELEASES/latest")"
  tag="${latest_url##*/}"
  tag="${tag#v}"
  tarball="$TMP/helper.tar.gz"

  mkdir -p "$HELPER_HOME"
  curl -fsSL --retry 3 \
    "$HELPER_RELEASES/download/v${tag}/${HELPER_BIN}-${tag}-${target}.tar.gz" \
    -o "$tarball"
  tar xzf "$tarball" -C "$HELPER_HOME"
  chmod +x "$HELPER_HOME/$HELPER_BIN"
  export PATH="$HELPER_HOME:$PATH"
  append_helper_path
}

ensure_helper_state() {
  select_state_home
  mkdir -p "$XDG_STATE_HOME/$HELPER_BIN/Backup"

  # The helper currently uses this macOS state path even when XDG_STATE_HOME is
  # set. Create only its own subfolder if the parent was made root-owned by an
  # earlier install.
  local fixed_home_state="$HOME/.local/state/$HELPER_BIN/Backup"
  if ! mkdir -p "$fixed_home_state" 2>/dev/null; then
    echo "Fixing FreeJam helper state permissions…"
    sudo mkdir -p "$fixed_home_state"
    sudo chown -R "$(id -u):$(id -g)" "$HOME/.local/state/$HELPER_BIN"
  fi
}

detect_premium() {
  case "${FREEJAM_PREMIUM:-auto}" in
    1|true|TRUE|yes|YES|premium|Premium) return 0 ;;
    0|false|FALSE|no|NO|free|Free) return 1 ;;
  esac

  local prefs=()
  if [ "$OS" = "Darwin" ]; then
    prefs+=("$HOME/Library/Application Support/Spotify/prefs")
    while IFS= read -r f; do prefs+=("$f"); done < <(
      find "$HOME/Library/Application Support/Spotify/Users" -name prefs -type f 2>/dev/null || true
    )
  else
    prefs+=("$HOME/.config/spotify/prefs")
    prefs+=("$HOME/.var/app/com.spotify.Client/config/spotify/prefs")
    while IFS= read -r f; do prefs+=("$f"); done < <(
      find "$HOME/.config/spotify/Users" "$HOME/.var/app/com.spotify.Client/config/spotify/Users" \
        -name prefs -type f 2>/dev/null || true
    )
  fi

  local f
  for f in "${prefs[@]}"; do
    [ -r "$f" ] || continue
    if LC_ALL=C grep -Eiq '(product|account|subscription|catalogue|type)[^[:alnum:]]+(state|level|type)?[^[:alnum:]]*(premium|paid)' "$f" ||
      LC_ALL=C grep -Eiq '(premium|paid)[^[:alnum:]]+(true|1|subscriber)' "$f"; then
      return 0
    fi
  done

  return 1
}

run_audio_patch() {
  if [ "${FREEJAM_SKIP_AUDIO_PATCH:-0}" = "1" ]; then
    echo "Skipping audio patch because FREEJAM_SKIP_AUDIO_PATCH=1."
    return
  fi

  if detect_premium; then
    PREMIUM_DETECTED=1
    echo "Premium account detected; installing FreeJam only."
    return
  fi

  local patch_script="$TMP/audio-patch.sh"
  local flags=()
  if [ -n "${FREEJAM_AUDIO_PATCH_FLAGS:-}" ]; then
    read -r -a flags <<<"${FREEJAM_AUDIO_PATCH_FLAGS}"
  elif [ "$OS" = "Darwin" ]; then
    flags=(-f -B -c)
    if [ ! -d "/Applications/Spotify.app" ] && [ ! -d "$HOME/Applications/Spotify.app" ]; then
      flags=(--installmac -f -B -c)
    fi
  else
    flags=(-f -c)
  fi

  echo "Preparing Spotify audio patch…"
  curl -fsSL --retry 3 "$PATCHER_URL" -o "$patch_script"
  if command -v "$HELPER_BIN" >/dev/null 2>&1; then
    echo "Resetting existing FreeJam helper patch…"
    "$HELPER_BIN" restore >"$TMP/restore.log" 2>&1 || true
    "$HELPER_BIN" clear >"$TMP/clear.log" 2>&1 || true
  fi
  if ! run_with_log "$TMP/audio-patch.log" bash "$patch_script" "${flags[@]}"; then
    if LC_ALL=C grep -Eiq 'already been installed|use the .-f. flag to force' "$TMP/audio-patch.log"; then
      echo "Audio cleanup already present; continuing."
      return
    fi
    fail_with_log "Audio patch failed. Re-run this installer after fixing the setup issue." "$TMP/audio-patch.log"
  fi
}

select_state_home
run_audio_patch

# Install the extension runtime without the helper's interactive add-on prompt.
if ! command -v "$HELPER_BIN" >/dev/null 2>&1; then
  install_helper >"$TMP/helper.log" 2>&1 || {
    fail_with_log "Setup failed." "$TMP/helper.log"
  }
fi

if ! command -v "$HELPER_BIN" >/dev/null 2>&1; then
  echo "Setup completed but the helper isn't on your PATH yet."
  echo "Open a new terminal and re-run this command."
  exit 1
fi

# Ensure the config dir exists and find the Extensions folder.
"$HELPER_BIN" >/dev/null 2>&1 || true
CONFIG_FILE="$("$HELPER_BIN" -c 2>/dev/null || true)"
if [ -z "$CONFIG_FILE" ]; then
  fail_with_log "Could not find the FreeJam helper config." "$TMP/helper.log"
fi
EXT_DIR="$(dirname "$CONFIG_FILE")/Extensions"
mkdir -p "$EXT_DIR"

echo "Downloading FreeJam…"
curl -fsSL --retry 3 "https://github.com/${REPO}/releases/latest/download/freejam.js" -o "$EXT_DIR/freejam.js"

# Register and apply.
"$HELPER_BIN" config extensions freejam.js >"$TMP/cfg.log" 2>&1
# Remove the Spicetify Marketplace sidebar button (no-op if not present).
"$HELPER_BIN" config custom_apps marketplace- >>"$TMP/cfg.log" 2>&1 || true
ensure_helper_state
"$HELPER_BIN" backup apply >"$TMP/apply.log" 2>&1 || {
  fail_with_log "Could not apply FreeJam to Spotify." "$TMP/apply.log"
}

echo ""
if [ "$PREMIUM_DETECTED" = "1" ] || [ "${FREEJAM_SKIP_AUDIO_PATCH:-0}" = "1" ]; then
  echo "✓ FreeJam installed."
else
  echo "✓ FreeJam installed with Spotify audio cleanup."
fi
echo "  Open Spotify, then click FreeJam in the playbar — bottom-right, next to the lyrics icon."
