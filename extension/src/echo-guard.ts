let suppressUntil = 0;
let suppressedTrack: string | null = null;

export function suppress(trackUri: string | null, ms = 1500): void {
  suppressedTrack = trackUri;
  suppressUntil = Date.now() + ms;
}

export function shouldSuppress(currentTrackUri: string | null): boolean {
  if (Date.now() >= suppressUntil) return false;
  // Only suppress when the local track matches the one we just applied.
  // If the user has changed to a different track within the window, broadcast it.
  return currentTrackUri === suppressedTrack;
}

export function isWithinSuppress(): boolean {
  return Date.now() < suppressUntil;
}
