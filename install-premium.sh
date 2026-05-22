#!/usr/bin/env bash
# FreeJam Premium installer — installs FreeJam only (skips the audio patch).
# For Spotify Premium users. Run on every machine. macOS and Linux.
#
#   curl -fsSL -H 'Accept: application/vnd.github.raw' \
#     https://api.github.com/repos/jaydenszeto/freejam/contents/install-premium.sh | bash
#
# Internally this just runs install.sh with FREEJAM_PREMIUM=1.
set -euo pipefail
curl -fsSL --retry 3 -H 'Accept: application/vnd.github.raw' \
  https://api.github.com/repos/jaydenszeto/freejam/contents/install.sh \
  | FREEJAM_PREMIUM=1 bash
