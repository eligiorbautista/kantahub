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
import { walkMidiTracks } from "@/lib/midiMeta";
import { defaultSongsDir, getSongsIndex } from "@/lib/songIndex";
import { findSoundfont } from "@/lib/soundfont";

const SAMPLE_RATE = 22_050;
const GAIN = 0.8;
const RENDER_TIMEOUT_MS = 5 * 60 * 1000;
/** How many rendered songs to keep on disk (each is tens of MB). */
const MAX_CACHED_RENDERS = 15;
/** Silence kept after the last MIDI event, for the release/reverb tail. */
const TAIL_SEC = 1.5;
const DEFAULT_US_PER_QUARTER = 500_000;

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

/**
 * End of the song in seconds, derived from the file's own tempo map. FluidSynth
 * renders a long silent tail past the last event, and the player treats "the
 * audio ended" as "the song ended" — without trimming, the score screen would
 * only appear many seconds after the last lyric.
 */
export function songEndSeconds(buf: Uint8Array): number | null {
  const tempos: Array<{ tick: number; usPerQuarter: number }> = [];
  let maxTick = 0;
  let ticksPerQuarter = 0;
  try {
    const header = walkMidiTracks(buf, {
      onMeta(type, data, ticks) {
        if (ticks > maxTick) maxTick = ticks;
        if (type === 0x51 && data.length === 3) {
          tempos.push({ tick: ticks, usPerQuarter: (data[0] << 16) | (data[1] << 8) | data[2] });
        }
      },
    });
    ticksPerQuarter = header.ticksPerQuarter;
  } catch {
    return null;
  }
  if (ticksPerQuarter <= 0 || maxTick <= 0) return null;

  tempos.sort((a, b) => a.tick - b.tick);
  let sec = 0;
  let lastTick = 0;
  let usPerQuarter = DEFAULT_US_PER_QUARTER;
  for (const tempo of tempos) {
    if (tempo.tick > maxTick) break;
    sec += ((tempo.tick - lastTick) / ticksPerQuarter) * (usPerQuarter / 1_000_000);
    lastTick = tempo.tick;
    usPerQuarter = tempo.usPerQuarter;
  }
  sec += ((maxTick - lastTick) / ticksPerQuarter) * (usPerQuarter / 1_000_000);
  return sec;
}

/**
 * Truncate a PCM WAV to at most `seconds`, rewriting the RIFF and data sizes.
 * Chunks are walked rather than assuming a 44-byte header.
 */
export async function trimWav(file: string, seconds: number): Promise<void> {
  if (!(seconds > 0)) return;
  const buf = await fs.readFile(file);
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    return;
  }
  let pos = 12;
  let sampleRate = 0;
  let blockAlign = 0;
  let dataStart = -1;
  let dataSize = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === "fmt " && pos + 8 + 16 <= buf.length) {
      sampleRate = buf.readUInt32LE(pos + 12);
      blockAlign = buf.readUInt16LE(pos + 20);
    } else if (id === "data") {
      dataStart = pos + 8;
      dataSize = Math.min(size, buf.length - dataStart);
      break;
    }
    pos += 8 + size + (size % 2);
  }
  if (dataStart < 0 || sampleRate <= 0 || blockAlign <= 0) return;

  const wanted = Math.min(dataSize, Math.floor(seconds * sampleRate) * blockAlign);
  if (wanted >= dataSize) return;

  const out = Buffer.from(buf.subarray(0, dataStart + wanted));
  out.writeUInt32LE(out.length - 8, 4); // RIFF chunk size
  out.writeUInt32LE(wanted, dataStart - 4); // data chunk size
  await fs.writeFile(file, out);
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
    const midiPath = path.join(songsDir, song.fileName);
    try {
      await runFluidSynth(soundfont, midiPath, partial);
      // FluidSynth keeps rendering silence long after the last note, and the
      // player reads "audio ended" as "song ended" — trim to the real end so the
      // score screen appears right after the last lyric.
      try {
        const end = songEndSeconds(new Uint8Array(await fs.readFile(midiPath)));
        if (end !== null) await trimWav(partial, end + TAIL_SEC);
      } catch {
        // Trimming is best-effort; an untrimmed render still plays.
      }
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
