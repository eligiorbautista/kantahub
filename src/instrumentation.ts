// src/instrumentation.ts
// Runs once at server start. Warms the songs index in the background so the
// first user request does not pay the full library scan cost.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warmSongsIndex } = await import("@/lib/songIndex");
    // Fire-and-forget, never crash startup on a missing/failing songs dir.
    warmSongsIndex().catch((err) => {
      console.warn("kantahub: songs index warm-up failed:", err);
    });

    // Seed the room's default lyric-sync offset from persisted host settings.
    try {
      const { loadSettings } = await import("@/lib/settings");
      const { setDefaultLyricOffsetSec } = await import("@/lib/remoteStore");
      setDefaultLyricOffsetSec((await loadSettings()).lyricOffsetSec);
    } catch (err) {
      console.warn("kantahub: failed to load host settings:", err);
    }
  }
}
