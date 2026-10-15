// tests/renderAudio.test.ts
// The server render is what makes the TV work on a plain http origin. Two things
// it must get right:
//   - FluidSynth keeps rendering silence long after the last note, and the
//     player reads "audio ended" as "song ended", so the file has to be trimmed
//     or the score screen appears many seconds after the last lyric;
//   - the trim must rewrite the RIFF sizes so the browser sees a valid file.
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { songEndSeconds, trimWav } from "@/lib/renderAudio";

/** A canonical 44-byte-header PCM WAV of `seconds` of silence. */
function silentWav(seconds: number, sampleRate = 22050, channels = 2, bits = 16): Buffer {
  const blockAlign = channels * (bits / 8);
  const dataSize = Math.floor(seconds * sampleRate) * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bits, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

describe("songEndSeconds", () => {
  it("returns null for data that is not a MIDI file", () => {
    expect(songEndSeconds(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it("derives a plausible end time from a real KAR file", () => {
    const buf = new Uint8Array(readFileSync(new URL("./fixtures/songs/with-lyrics.kar", import.meta.url)));
    const end = songEndSeconds(buf);
    expect(end).not.toBeNull();
    expect(end!).toBeGreaterThanOrEqual(0);
  });
});

describe("trimWav", () => {
  it("shortens the file and rewrites both RIFF sizes", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kantahub-wav-"));
    const file = path.join(dir, "long.wav");
    await fs.writeFile(file, silentWav(10));

    await trimWav(file, 2);

    const out = await fs.readFile(file);
    const blockAlign = 2 * 2;
    const expectedData = Math.floor(2 * 22050) * blockAlign;
    expect(out.length).toBe(44 + expectedData);
    expect(out.readUInt32LE(4)).toBe(out.length - 8); // RIFF chunk size
    expect(out.readUInt32LE(40)).toBe(expectedData); // data chunk size
    expect(out.toString("ascii", 36, 40)).toBe("data");
  });

  it("leaves a file that is already short enough alone", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kantahub-wav-"));
    const file = path.join(dir, "short.wav");
    const original = silentWav(1);
    await fs.writeFile(file, original);

    await trimWav(file, 30);

    expect(await fs.readFile(file)).toEqual(original);
  });

  it("ignores a non-WAV file instead of corrupting it", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kantahub-wav-"));
    const file = path.join(dir, "nope.wav");
    const original = Buffer.from("not a wave file at all");
    await fs.writeFile(file, original);

    await trimWav(file, 1);

    expect(await fs.readFile(file)).toEqual(original);
  });
});
