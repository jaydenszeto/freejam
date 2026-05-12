#!/usr/bin/env bash
# FreeJam installer — run on every machine.
#   curl -fsSL https://raw.githubusercontent.com/jaydenszeto/freejam/main/install.sh | bash
set -euo pipefail

REPO="jaydenszeto/freejam"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

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

# Install the underlying runtime if it isn't on PATH.
if ! command -v spicetify >/dev/null 2>&1; then
  curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh >"$TMP/cli.log" 2>&1 || {
    echo "Setup failed. Log:"; cat "$TMP/cli.log"; exit 1
  }
  export PATH="$HOME/.spicetify:$PATH"
fi

# Sometimes the new PATH entry isn't on the current shell — search common locations.
if ! command -v spicetify >/dev/null 2>&1; then
  for p in "$HOME/.spicetify" "/opt/homebrew/bin" "/usr/local/bin"; do
    if [ -x "$p/spicetify" ]; then export PATH="$p:$PATH"; break; fi
  done
fi

if ! command -v spicetify >/dev/null 2>&1; then
  echo "Setup completed but the helper isn't on your PATH yet."
  echo "Open a new terminal and re-run this command."
  exit 1
fi

# Ensure the config dir exists and find the Extensions folder.
spicetify >/dev/null 2>&1 || true
EXT_DIR="$(spicetify config-dir 2>/dev/null)/Extensions"
mkdir -p "$EXT_DIR"

echo "Downloading FreeJam…"
curl -fsSL --retry 3 "https://github.com/${REPO}/releases/latest/download/freejam.js" -o "$EXT_DIR/freejam.js"

# Register and apply.
spicetify config extensions freejam.js >"$TMP/cfg.log" 2>&1
spicetify backup apply >"$TMP/apply.log" 2>&1 || {
  echo "Could not apply FreeJam to Spotify. Log:"; cat "$TMP/apply.log"; exit 1
}

# Re-apply a pre-existing ad-block patch if one is locally installed.
if [ -d "$HOME/SpotX-Bash" ] && [ -f "$HOME/SpotX-Bash/SpotX-Bash.sh" ]; then
  bash "$HOME/SpotX-Bash/SpotX-Bash.sh" -y >"$TMP/extra.log" 2>&1 || true
elif command -v spotx >/dev/null 2>&1; then
  spotx -y >"$TMP/extra.log" 2>&1 || true
fi

echo ""
echo "✓ FreeJam installed."
echo "  Open Spotify, then click FreeJam in the top bar."
