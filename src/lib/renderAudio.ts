// src/lib/renderAudio.ts
// Server-side audio rendering (FluidSynth).
//
// Browsers only expose the Web Audio worklet in a SECURE CONTEXT, so a device
// that reaches KantaHub over plain http — a Smart TV whose browser cannot do
// https, for example — cannot run the in-browser synth at all. For those clients
// the server renders the song once with FluidSynth and the TV plays the result
// through a plain <audio> element, which works on any origin.
//
// Rendering is much faster than real time (~4s for a 5-minute song here), and
// results are cached on disk, so only the first play of a song pays the cost.
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultSongsDir, getSongsIndex } from "@/lib/songIndex";
import { findSoundfont } from "@/lib/soundfont";

const SAMPLE_RATE = 22_050;
const GAIN = 0.8;
const RENDER_TIMEOUT_MS = 5 * 60 * 1000;
/** How many rendered songs to keep on disk (each is tens of MB). */
const MAX_CACHED_RENDERS = 15;

function cacheDir(): string {
  return path.join(process.env.INDEX_DIR ?? path.join(os.tmpdir(), "kantahub-index"), "audio");
}

// One job per song: concurrent requests (the player plus a queue pre-render)
// share the same render instead of starting two.
const rendering = new Map<string, Promise<string | null>>();

function runFluidSynth(soundfont: string, midi: string, out: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "fluidsynth",
      ["-F", out, "-r", String(SAMPLE_RATE), "-g", String(GAIN), soundfont, midi],
      { timeout: RENDER_TIMEOUT_MS, maxBuffer: 1 << 20 },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

/** Drop the oldest renders once the cache is over its cap. */
async function pruneCache(): Promise<void> {
  try {
    const dir = cacheDir();
    const entries = (await fs.readdir(dir)).filter((n) => n.endsWith(".wav"));
    if (entries.length <= MAX_CACHED_RENDERS) return;
    const withTimes = await Promise.all(
      entries.map(async (name) => {
        try {
          return { name, at: (await fs.stat(path.join(dir, name))).mtimeMs };
        } catch {
          return { name, at: 0 };
        }
      }),
    );
    withTimes.sort((a, b) => a.at - b.at);
    for (const stale of withTimes.slice(0, withTimes.length - MAX_CACHED_RENDERS)) {
      await fs.rm(path.join(dir, stale.name), { force: true });
    }
  } catch {
    // Pruning is best-effort.
  }
}

/**
 * Path of the rendered WAV for a song, rendering it first when needed.
 * Returns null when it cannot be produced (no soundfont, unknown song, or the
 * renderer failed); the caller answers 404/503.
 */
export function renderSongAudio(songId: string): Promise<string | null> {
  const inFlight = rendering.get(songId);
  if (inFlight) return inFlight;

  const job = (async (): Promise<string | null> => {
    const soundfont = findSoundfont(process.env.SOUND_DIR ?? "/sound");
    if (!soundfont) return null;

    // The soundfont is part of the result, so its mtime is part of the key:
    // dropping in a new SoundFont invalidates every cached render.
    let stamp = "0";
    try {
      stamp = String(Math.round((await fs.stat(soundfont)).mtimeMs));
    } catch {
      return null;
    }
    const file = path.join(cacheDir(), `${songId}-${stamp}.wav`);

    try {
      if ((await fs.stat(file)).size > 0) return file;
    } catch {
      // Not rendered yet.
    }

    const songsDir = defaultSongsDir();
    const song = (await getSongsIndex(songsDir)).find((s) => s.id === songId);
    if (!song) return null;

    await fs.mkdir(cacheDir(), { recursive: true });
    const partial = `${file}.part`;
    try {
      await runFluidSynth(soundfont, path.join(songsDir, song.fileName), partial);
      await fs.rename(partial, file);
    } catch (err) {
      await fs.rm(partial, { force: true });
      console.error("kantahub: audio render failed:", err);
      return null;
    }
    void pruneCache();
    return file;
  })();

  rendering.set(songId, job);
  void job.finally(() => rendering.delete(songId));
  return job;
}
