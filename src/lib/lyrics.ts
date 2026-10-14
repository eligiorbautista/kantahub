// src/lib/lyrics.ts
// Embedded-lyric extraction for .mid/.kar files. Lyric meta events
// (0xFF 0x05) carry karaoke text fragments at absolute tick positions;
// "/" and "\" prefixes and CR/LF characters mark display-line breaks
// (KAR convention), CR alone splits lines without injecting whitespace.

import { walkMidiTracks } from "@/lib/midiMeta";

export interface LyricLine {
  timeSec: number;
  text: string;
}

interface RawLyric {
  ticks: number;
  text: string;
}

// Collect raw FF 05 lyric events with absolute tick positions. Never throws:
// unparsable files simply have no lyrics.
export function rawLyricEvents(buf: Buffer): RawLyric[] {
  const events: RawLyric[] = [];
  try {
    walkMidiTracks(buf, {
      onMeta(type, data, ticks) {
        if (type === 0x05 && data.length > 0) {
          events.push({ ticks, text: data.toString("utf8") });
        }
      },
    });
  } catch {
    return [];
  }
  events.sort((a, b) => a.ticks - b.ticks);
  return events;
}

// 0 = mid-line, 1 = line starts here (with a leading space separator),
// 2 = hard line start (no whitespace separator, used after CR breaks).
type BreakKind = 0 | 1 | 2;

function chunkLyric(text: string): { breakBefore: BreakKind; body: string } {
  let breakBefore: BreakKind = 0;
  let i = 0;
  // Only "/" , "\" and LF lead an event as break markers per KAR convention;
  // a leading CR alone is a hard break (paragraph separator).
  if (text.startsWith("\r") && !text.startsWith("\r\n")) {
    breakBefore = 2;
    i = 1;
  } else {
    while (i < text.length && (text[i] === "/" || text[i] === "\\" || text[i] === "\n")) {
      breakBefore = 1;
      i += 1;
    }
  }
  const endsWithBreak = /[\r\n]$/.test(text);
  let body = text.slice(i).replace(/[\r\n]/g, " ");
  if (breakBefore === 1 && body.length > 0) body = " " + body;
  return { breakBefore: endsWithBreak ? 1 : breakBefore, body };
}

// Extract embedded lyrics as timed display lines. `ticksToSeconds` converts
// absolute tick positions; it is injected so timing stays testable without
// audio (players deriving it from tempo/PPQ pass their own converter).
// Consecutive fragments between break markers merge into one display line;
// whitespace-only entries are dropped. Returns [] when there are no lyrics.
export function extractLyrics(
  buf: Buffer,
  ticksToSeconds: (ticks: number) => number,
): LyricLine[] {
  const raw = rawLyricEvents(buf);
  const lines: LyricLine[] = [];
  let text = "";
  let startTicks = 0;

  const flush = () => {
    const trimmed = text.trim();
    if (trimmed) lines.push({ timeSec: ticksToSeconds(startTicks), text: trimmed });
    text = "";
  };

  for (const ev of raw) {
    const { breakBefore, body } = chunkLyric(ev.text);
    if (breakBefore !== 0) {
      flush();
      startTicks = ev.ticks;
      text = body;
      continue;
    }
    if (text.length === 0) {
      // Whitespace-only entries never open a line nor set its start time.
      if (body.trim().length === 0) continue;
      startTicks = ev.ticks;
    }
    text += body;
  }
  flush();
  return lines;
}

// Index of the active line at `timeSec`: the last line whose timeSec has
// passed, or -1 before the first line / for empty input.
export function activeLineIndex(lines: LyricLine[], timeSec: number): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeSec <= timeSec) active = i;
    else break;
  }
  return active;
}
