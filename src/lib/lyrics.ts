// src/lib/lyrics.ts
// Embedded-lyric extraction for .mid/.kar files. Lyric meta events
// (0xFF 0x05) carry karaoke text fragments at absolute tick positions;
// "/" and "\" prefixes and CR/LF characters mark display-line breaks
// (KAR convention), CR alone splits lines without injecting whitespace.

import { walkMidiTracks } from "@/lib/midiMeta";

export interface LyricLine {
  timeSec: number;
  /** Approximate time the last syllable of this line is sung. Used to tell a
   *  finished line apart from an instrumental break before the next one. */
  endSec?: number;
  text: string;
}

interface RawLyric {
  ticks: number;
  text: string;
}

const textDecoder = new TextDecoder("utf-8");

// Collect raw FF 05 lyric events with absolute tick positions. Never throws:
// unparsable files simply have no lyrics. Accepts any Uint8Array so the same
// extractor runs server-side and in the browser without a Buffer polyfill.
export function rawLyricEvents(buf: Uint8Array): RawLyric[] {
  const events: RawLyric[] = [];
  try {
    walkMidiTracks(buf, {
      onMeta(type, data, ticks) {
        if (type === 0x05 && data.length > 0) {
          events.push({ ticks, text: textDecoder.decode(data) });
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

function chunkLyric(text: string): { breakBefore: BreakKind; body: string; breakAfter: boolean } {
  let breakBefore: BreakKind = 0;
  let i = 0;
  // A leading CR or CRLF is a hard break (paragraph separator, no whitespace
  // injected); "/", "\" and LF are soft break markers. CRLF is consumed as a
  // single marker so it produces exactly one break.
  if (text.startsWith("\r\n")) {
    breakBefore = 2;
    i = 2;
  } else if (text.startsWith("\r")) {
    breakBefore = 2;
    i = 1;
  } else {
    while (i < text.length && (text[i] === "/" || text[i] === "\\" || text[i] === "\n")) {
      breakBefore = 1;
      i += 1;
    }
  }
  // A trailing CR/LF closes the CURRENT line after its body is appended
  // (Soft Karaoke convention: a line's final fragment carries the newline).
  let j = text.length;
  let breakAfter = false;
  while (j > i && (text[j - 1] === "\n" || text[j - 1] === "\r")) {
    breakAfter = true;
    j -= 1;
  }
  let body = text.slice(i, j).replace(/[\r\n]/g, " ");
  if (breakBefore === 1 && body.length > 0) body = " " + body;
  return { breakBefore, body, breakAfter };
}

// Extract embedded lyrics as timed display lines. `ticksToSeconds` converts
// absolute tick positions; it is injected so timing stays testable without
// audio (players deriving it from tempo/PPQ pass their own converter).
// Consecutive fragments between break markers merge into one display line;
// whitespace-only entries are dropped. Returns [] when there are no lyrics.
export function extractLyrics(
  buf: Uint8Array,
  ticksToSeconds: (ticks: number) => number,
): LyricLine[] {
  const raw = rawLyricEvents(buf);
  const lines: LyricLine[] = [];
  let text = "";
  let startTicks = 0;
  let endTicks = 0;

  const flush = () => {
    const trimmed = text.trim();
    if (trimmed) {
      lines.push({
        timeSec: ticksToSeconds(startTicks),
        endSec: ticksToSeconds(endTicks),
        text: trimmed,
      });
    }
    text = "";
  };

  for (const ev of raw) {
    const { breakBefore, body, breakAfter } = chunkLyric(ev.text);
    if (breakBefore !== 0) {
      flush();
      startTicks = ev.ticks;
      endTicks = ev.ticks;
      text = body;
    } else if (text.length === 0) {
      // Whitespace-only entries never open a line nor set its start time.
      if (body.trim().length === 0) continue;
      startTicks = ev.ticks;
      endTicks = ev.ticks;
      text = body;
    } else {
      text += body;
      endTicks = ev.ticks;
    }
    // A trailing break flushes AFTER the body joined the current line, so the
    // next fragment starts a new line at its own tick.
    if (breakAfter) flush();
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

// Remaining whole seconds until the first line, for the intro countdown
// ("3", "2", "1"): ceil keeps each digit up for a full second, so "1" holds
// through the final second before the opening lyric. Null once lyrics have
// started or when there are no lines.
export function introCountdown(lines: LyricLine[], timeSec: number): number | null {
  if (lines.length === 0 || lines[0].timeSec <= timeSec) return null;
  return Math.ceil(lines[0].timeSec - timeSec);
}

/** A gap longer than this after a line finishes is treated as a break. */
export const INTERLUDE_MIN_SEC = 6;
/** Seconds before the next line when the "singing in" countdown reappears. */
export const INTERLUDE_COUNTDOWN_SEC = 5;
/**
 * Assumed length of a lyric line whose end is unknown (a single-fragment line
 * carries no end tick). Used only to keep the break card from replacing a line
 * that may still be sung.
 */
export const MIN_LINE_SEC = 2.5;

export interface InterludeInfo {
  /** True while the song sits in an instrumental break between two lines. */
  active: boolean;
  /** Seconds until the next line starts (0 when no break is active). */
  untilNextSec: number;
}

// Detect an instrumental break between two lyric lines: the current line has
// been sung but the next one is still far away. Small gaps are just breaths and
// do not count.
export function interludeInfo(lines: LyricLine[], timeSec: number): InterludeInfo {
  const active = activeLineIndex(lines, timeSec);
  if (active < 0) return { active: false, untilNextSec: 0 };
  const current = lines[active];
  const next = lines[active + 1];
  if (!next) return { active: false, untilNextSec: 0 };

  // `endSec` is the tick of the line's LAST fragment, i.e. the start of its
  // final syllable — and a single-fragment line carries no end at all — so the
  // singing always runs past it. Only a genuinely long break counts.
  const lastSyllable =
    current.endSec !== undefined && current.endSec > current.timeSec ? current.endSec : current.timeSec;
  if (next.timeSec - lastSyllable <= INTERLUDE_MIN_SEC) return { active: false, untilNextSec: 0 };

  // Wait out the line's own span (how long it took to reach that syllable) plus
  // a beat, so the break card never replaces a line that is still being sung.
  // A single-fragment line has no span at all, so assume a short line.
  const sungSpan = Math.max(lastSyllable - current.timeSec, MIN_LINE_SEC);
  if (timeSec <= current.timeSec + sungSpan + 1.5) return { active: false, untilNextSec: 0 };

  return { active: true, untilNextSec: next.timeSec - timeSec };
}
