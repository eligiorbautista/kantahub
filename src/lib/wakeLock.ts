// src/lib/wakeLock.ts
// Screen Wake Lock API wrapper: keeps the TV awake while a song plays.
// The navigator is injected so node tests can pass a stub. The API is
// feature-detected — old TV browsers simply get no wake lock — and
// requestWakeLock must never throw: playback must not crash over a lock.

// The lock for the whole app. One sentinel at a time: extra requests while
// one is held (or in flight) return null instead of stacking sentinels,
// which would keep the screen awake after a release.
let active: WakeLockSentinel | null = null;
// True while the browser is still deciding on a request.
let pending = false;
// Bumped by every releaseWakeLock call. An in-flight request compares the
// epoch it started with against the current one, so a pause/stop landing
// while the browser is granting a lock makes the late grant be dropped.
let releaseEpoch = 0;

export async function requestWakeLock(nav: Navigator): Promise<WakeLockSentinel | null> {
  if (pending) return null;
  if (active && !active.released) return null;
  const epoch = releaseEpoch;
  pending = true;
  try {
    // Feature-detect first: TVs without the API have wakeLock undefined.
    const request = nav.wakeLock?.request;
    if (!request) return null;
    const sentinel = await request.call(nav.wakeLock, "screen");
    if (epoch !== releaseEpoch) {
      // The player paused/stopped while we awaited: hand the late lock
      // straight back so the screen can sleep with the player stopped.
      try {
        await sentinel.release();
      } catch {
        // Spec says an already-released sentinel resolves silently; a TV
        // browser might disagree — either way cleanup must not throw.
      }
      return null;
    }
    active = sentinel;
    return sentinel;
  } catch (err) {
    // Unsupported, denied (battery saver, insecure context), or the
    // browser beeped — swallow and carry on.
    console.error("wake lock request failed:", err);
    return null;
  } finally {
    pending = false;
  }
}

export async function releaseWakeLock(): Promise<void> {
  releaseEpoch += 1; // invalidates any in-flight requestWakeLock
  const sentinel = active;
  active = null;
  if (!sentinel || sentinel.released) return;
  try {
    await sentinel.release();
  } catch {
    // Already revoked by the browser, or the TV browser objects — never
    // let lock cleanup throw to the player.
  }
}
