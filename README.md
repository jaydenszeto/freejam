# FreeJam

Listen to Spotify with friends — on your own account, in sync, with bidirectional control. Anyone in the room plays a song and everyone hears it. Pause, seek, skip — all of it propagates both ways.

## Install

Run this on every machine. Same line for everyone. macOS and Linux.
The installer adds FreeJam on top of Spotify. Free-tier installs also receive
the audio cleanup patch needed to remove ads.

```
curl -fsSL https://raw.githubusercontent.com/jaydenszeto/freejam/main/install.sh | bash
```

Then **open Spotify** and click the **FreeJam** button in the playbar — bottom-right, next to the lyrics icon.

If the installer detects a Premium account, it installs only FreeJam.
Otherwise, macOS installs block Spotify auto-updates and clear the app cache
before FreeJam is applied.

Detection depends on local Spotify account prefs. To force FreeJam-only mode,
set `FREEJAM_PREMIUM=1`; to force the free-tier patch plus FreeJam, set
`FREEJAM_PREMIUM=0`. To customize the audio patch, set
`FREEJAM_AUDIO_PATCH_FLAGS`; to skip it regardless of account type, set
`FREEJAM_SKIP_AUDIO_PATCH=1`.

When using the one-line installer, put overrides on `bash`, for example:

```
curl -fsSL https://raw.githubusercontent.com/jaydenszeto/freejam/main/install.sh | FREEJAM_PREMIUM=1 bash
```

## Use

1. One person clicks **Start a Room** and shares the 6-character code.
2. Others click **Join a Room** and enter the code.
3. Play music in Spotify like you normally would. Everyone hears it.

## License

MIT.
