// src/lib/midiMeta.ts
// Minimal Standard MIDI File (SMF) metadata reader for .mid/.kar files.
// Extracts the track-name meta event as the title and detects whether
// embedded lyric meta events exist, without loading the full song.
//
// Exposes the low-level track walker (walkMidiTracks) so other readers
// (notably src/lib/lyrics.ts) can reuse one parser instead of duplicating it.

export interface MidiInfo {
  title?: string;
  // Reserved for future use (e.g. copyright meta or @T text events).
  artist?: string;
  hasLyrics: boolean;
}

export interface MidiHeaderInfo {
  // Ticks per quarter note (0 when the file uses SMPTE division).
  ticksPerQuarter: number;
}

export interface MidiEventHandlers {
  // Meta event (0xFF): ticks is the absolute tick position within the file.
  onMeta?: (metaType: number, data: Buffer, ticks: number) => void;
}

type ByteReader = { value: number; pos: number };

// Read a variable-length quantity (delta time or meta length): up to 4
// bytes, 7 bits each, high bit set means another byte follows.
function readVlq(track: Buffer, pos: number): ByteReader {
  let value = 0;
  for (let i = 0; i < 4; i++) {
    if (pos >= track.length) throw new Error("Unexpected end of MIDI data");
    const byte = track[pos++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, pos };
  }
  throw new Error("Invalid variable-length quantity");
}

// Walk one MTrk chunk ([start, end) within the original buffer), invoking the
// handlers for each event of interest with its absolute tick position.
function parseTrack(chunk: Buffer, handlers: MidiEventHandlers): void {
  let pos = 0;
  let ticks = 0;
  // Running status: last channel-voice status byte, reused when an event
  // starts with a data byte (< 0x80). Meta and sysex events clear it.
  let runningStatus = 0;

  while (pos < chunk.length) {
    const delta = readVlq(chunk, pos);
    pos = delta.pos;
    ticks += delta.value;

    let status = chunk[pos];
    if (status < 0x80) {
      // Data byte first: running-status event, do not consume it.
      status = runningStatus;
      if (status < 0x80) throw new Error("MIDI data byte without running status");
    } else {
      if (status < 0xf0) runningStatus = status;
      pos++;
    }

    if (status === 0xff) {
      // Meta event: FF type length data
      if (pos >= chunk.length) throw new Error("Truncated meta event");
      const type = chunk[pos++];
      const length = readVlq(chunk, pos);
      pos = length.pos;
      const dataEnd = Math.min(pos + length.value, chunk.length);
      handlers.onMeta?.(type, chunk.subarray(pos, dataEnd), ticks);
      pos = dataEnd;
      runningStatus = 0;
    } else if (status === 0xf0 || status === 0xf7) {
      // Sysex event: F0/F7 followed by VLQ length and data bytes.
      const length = readVlq(chunk, pos);
      pos = Math.min(length.pos + length.value, chunk.length);
      runningStatus = 0;
    } else if (status < 0xf0) {
      // Channel-voice event: two data bytes, except program change (0xCx)
      // and channel pressure (0xDx) which take one.
      const size = (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2;
      pos = Math.min(pos + size, chunk.length);
    } else {
      // Unexpected system byte; skip it so parsing always advances.
      pos = Math.min(pos + 1, chunk.length);
    }
  }
}

// Walk every MTrk chunk of a Standard MIDI File buffer, invoking `handlers`
// for each parsed event. Returns the header division info. Throws on
// malformed input; callers decide whether to swallow that.
export function walkMidiTracks(buf: Buffer, handlers: MidiEventHandlers): MidiHeaderInfo {
  // MThd header: magic(4) length(4) format(2) ntrks(2) division(2)
  if (buf.length < 14 || buf.toString("latin1", 0, 4) !== "MThd") {
    throw new Error("Not a MIDI file");
  }
  const headerLength = buf.readUInt32BE(4);
  if (headerLength < 6) throw new Error("Invalid MIDI header");
  const division = buf.readUInt16BE(12);
  // High bit set means SMPTE time division rather than ticks-per-quarter.
  const ticksPerQuarter = (division & 0x8000) === 0 ? division : 0;
  const trackCount = buf.readUInt16BE(10);
  let pos = 8 + headerLength;

  for (let t = 0; t < trackCount && pos + 8 <= buf.length; t++) {
    const chunkId = buf.toString("latin1", pos, pos + 4);
    const chunkLength = buf.readUInt32BE(pos + 4);
    const start = pos + 8;
    const end = Math.min(start + chunkLength, buf.length);
    if (chunkId === "MTrk") parseTrack(buf.subarray(start, end), handlers);
    pos = start + chunkLength;
  }
  return { ticksPerQuarter };
}

// Parse a MIDI/KAR buffer. Never throws: on corrupt or truncated input it
// returns { hasLyrics: false } so callers can treat unparsable files as
// plain instrumental MIDI.
export function readMidiInfo(buf: Buffer): MidiInfo {
  const info: MidiInfo = { hasLyrics: false };
  try {
    walkMidiTracks(buf, {
      onMeta(type, data) {
        if (type === 0x03) {
          // Track name: first non-empty name wins (conventionally the title).
          if (info.title === undefined && data.length > 0) {
            info.title = data.toString("utf8");
          }
        } else if (type === 0x05) {
          info.hasLyrics = true;
        }
      },
    });
  } catch {
    return { hasLyrics: false };
  }
  return info;
}
