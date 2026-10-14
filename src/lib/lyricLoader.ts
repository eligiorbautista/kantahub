"use client";

// src/lib/lyricLoader.ts
// Browser-side lyric loading: fetch a song file and extract timed display
// lines. Tick→seconds conversion uses the file's own tempo map (FF 51 events)
// and ticks-per-quarter header so highlights land on the real playback time.
import { extractLyrics, type LyricLine } from "@/lib/lyrics";
import { walkMidiTracks } from "@/lib/midiMeta";

const DEFAULT_US_PER_QUARTER = 500_000; // MIDI default tempo: 120 BPM

interface TempoEvent {
  ticks: number;
  usPerQuarter: number;
}

// Build a tick-to-seconds converter from the file's tempo map (FF 51 events)
// and its ticks-per-quarter header. SMPTE files (ticksPerQuarter === 0) have
// no usable map; NaN keeps the highlight from guessing wrong timings.
export function makeTicksToSeconds(
  tempos: TempoEvent[],
  ticksPerQuarter: number,
): (ticks: number) => number {
  if (ticksPerQuarter <= 0) return () => Number.NaN;
  const segments: TempoEvent[] = [];
  for (const t of [...tempos].sort((a, b) => a.ticks - b.ticks)) {
    const last = segments[segments.length - 1];
    if (last && t.ticks === last.ticks) last.usPerQuarter = t.usPerQuarter; // later event wins
    else segments.push({ ticks: t.ticks, usPerQuarter: t.usPerQuarter });
  }
  if (segments.length === 0 || segments[0].ticks > 0) {
    segments.unshift({ ticks: 0, usPerQuarter: DEFAULT_US_PER_QUARTER });
  }
  return (ticks: number) => {
    let sec = 0;
    for (let i = 0; i < segments.length; i++) {
      const start = segments[i].ticks;
      const end = i + 1 < segments.length ? segments[i + 1].ticks : Infinity;
      const upto = Math.min(ticks, end);
      sec += ((upto - start) / ticksPerQuarter) * (segments[i].usPerQuarter / 1_000_000);
      if (ticks <= end) break;
    }
    return sec;
  };
}

// Fetch the song file and extract timed display lines. Never throws: any
// failure (network, corrupt file) yields [] and the UI shows the instrumental
// state.
export async function loadLyricLines(id: string): Promise<LyricLine[]> {
  try {
    const res = await fetch(`/api/songs/${encodeURIComponent(id)}/file`);
    if (!res.ok) throw new Error(`failed to fetch song ${id}: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const tempos: TempoEvent[] = [];
    const { ticksPerQuarter } = walkMidiTracks(buf, {
      onMeta(type, data, ticks) {
        if (type === 0x51 && data.length >= 3) {
          tempos.push({ ticks, usPerQuarter: (data[0] << 16) | (data[1] << 8) | data[2] });
        }
      },
    });
    return extractLyrics(buf, makeTicksToSeconds(tempos, ticksPerQuarter));
  } catch (err) {
    console.error("lyric extraction failed:", err);
    return [];
  }
}
