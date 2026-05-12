# FreeJam

Listen to Spotify with friends — on your own account, in sync, with bidirectional control. Anyone in the room plays a song and everyone hears it. Pause, seek, skip, and queue changes propagate both ways.

## Install

Run on every machine. macOS and Linux.

**Default — installs FreeJam plus the audio cleanup patch that removes ads.** Use this unless you're on Spotify Premium.

```
curl -fsSL https://raw.githubusercontent.com/jaydenszeto/freejam/main/install.sh | bash
```

**Spotify Premium — installs FreeJam only, no audio patch.**

```
curl -fsSL https://raw.githubusercontent.com/jaydenszeto/freejam/main/install-premium.sh | bash
```

Then **open Spotify** and click the **FreeJam** button in the playbar — bottom-right, next to the lyrics icon.

On macOS the audio patch also blocks Spotify auto-updates and clears the app cache so the patch sticks.

Advanced overrides (default installer):

- `FREEJAM_PREMIUM=1` or `FREEJAM_SKIP_AUDIO_PATCH=1` — skip the audio patch (same effect as using `install-premium.sh`).
- `FREEJAM_AUDIO_PATCH_FLAGS="…"` — override the audio-patch flag list.
- `FREEJAM_DEBUG=1` — print full setup logs on failure.

When using the one-line installer, put overrides on `bash`, e.g.:

```
curl -fsSL https://raw.githubusercontent.com/jaydenszeto/freejam/main/install.sh | FREEJAM_DEBUG=1 bash
```

## Use

1. One person clicks **Start a Room** and shares the 6-character code.
2. Others click **Join a Room** and enter the code.
3. Play music or add tracks to your queue in Spotify like you normally would. Everyone hears it and sees the shared queue.

## License

MIT.
