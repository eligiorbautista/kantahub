// tests/scanner.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { deriveFromFilename, parseSongFile } from "@/lib/scanner";

const load = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));

describe("deriveFromFilename", () => {
  it("parses the numbered 'N - Title - Artist' convention", () => {
    expect(deriveFromFilename("016001 - Us - Gracie Abrams ft. Taylor Swift.mid"))
      .toEqual({ number: "016001", artist: "Gracie Abrams ft. Taylor Swift", title: "Us" });
  });
  it("parses a numbered Filipino title with a long title", () => {
    expect(deriveFromFilename("00456 - Kahit Maputi Na Ang Buhok Ko - Rey Valera.mid"))
      .toEqual({ number: "00456", title: "Kahit Maputi Na Ang Buhok Ko", artist: "Rey Valera" });
  });
  it("parses 'Title - Singer' without a number (title first)", () => {
    expect(deriveFromFilename("My Way - Frank Sinatra.mid"))
      .toEqual({ number: undefined, title: "My Way", artist: "Frank Sinatra" });
  });
  it("keeps extra hyphens inside the title", () => {
    expect(deriveFromFilename("Love - Me - Do - The Beatles.mid"))
      .toEqual({ number: undefined, title: "Love - Me - Do", artist: "The Beatles" });
  });
  it("normalizes underscores and repeated spaces", () => {
    expect(deriveFromFilename("random__song.mid"))
      .toEqual({ number: undefined, title: "random song", artist: "" });
  });
  it("returns the whole name when there is no separator", () => {
    expect(deriveFromFilename("filename.mid"))
      .toEqual({ number: undefined, title: "filename", artist: "" });
  });
  it("preserves Tagalog and accented characters", () => {
    expect(deriveFromFilename("00123 - Bakit Ba - Erik Santos.mid").title).toBe("Bakit Ba");
    expect(deriveFromFilename("014 - Señorita - José Mari Chan.mid").artist).toBe("José Mari Chan");
  });
});

describe("parseSongFile", () => {
  it("uses the filename title for a structured filename (title-first)", () => {
    const buf = load("with-lyrics.kar"); // embedded track name is "Test Song"
    const s = parseSongFile("My Way - Frank Sinatra.mid", buf);
    expect(s.type).toBe("midi");
    expect(s.title).toBe("My Way"); // filename wins over the generic track name
    expect(s.artist).toBe("Frank Sinatra");
    expect(s.hasLyrics).toBe(true);
    expect(s.id).toBeTruthy();
  });
  it("carries the parsed song number", () => {
    const buf = load("with-lyrics.kar");
    const s = parseSongFile("00123 - My Way - Frank Sinatra.mid", buf);
    expect(s.number).toBe("00123");
    expect(s.title).toBe("My Way");
    expect(s.artist).toBe("Frank Sinatra");
  });
  it("falls back to the embedded title for a bare filename", () => {
    const buf = load("with-lyrics.kar");
    const s = parseSongFile("filename.mid", buf);
    expect(s.title).toBe("Test Song"); // embedded title used as fallback
    expect(s.artist).toBe("");
  });
});
