"use client";

// src/components/TvLyrics.tsx
// Lyrics-first stage for the TV. A window of lines is shown at once — a couple
// of already-sung lines above, the active line highlighted with a left-to-right
// karaoke wipe, and several upcoming lines below — so a singer who does not
// have the song memorized can still keep up. The lyrics are visible immediately
// (before the first line), so the singer can read ahead.
import { activeLineIndex, type LyricLine } from "@/lib/lyrics";

export interface TvLyricsProps {
  lines: LyricLine[];
  /** Playback position in seconds, already adjusted by the host lyric offset. */
  timeSec: number;
}

// How many already-sung lines stay visible above the active one, and how many
// upcoming lines are shown below it.
const LINES_BEFORE = 2;
const LINES_AFTER = 4;

export function TvLyrics({ lines, timeSec }: TvLyricsProps) {
  if (lines.length === 0) {
    return (
      <p data-testid="tv-instrumental" style={{ fontSize: "5vh", opacity: 0.7, margin: 0, textAlign: "center" }}>
        Instrumental — no lyrics
      </p>
    );
  }

  const active = activeLineIndex(lines, timeSec);
  // Before the first line, treat the opening line as active (wipe at 0%) so the
  // lyrics are on screen from the very start.
  const idx = Math.max(0, active);
  const start = Math.max(0, idx - LINES_BEFORE);
  const end = Math.min(lines.length, idx + LINES_AFTER + 1);
  const window = lines.slice(start, end);

  return (
    <div
      data-testid="tv-lyrics"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.4vh",
        width: "100%",
        textAlign: "center",
      }}
    >
      {window.map((line, i) => {
        const distance = start + i - idx; // <0 past, 0 active, >0 upcoming
        const isActive = distance === 0;

        if (isActive) {
          const nextLine = lines[idx + 1];
          const lineEnd = nextLine ? nextLine.timeSec : line.timeSec + 4;
          const progress =
            active < 0
              ? 0
              : Math.min(1, Math.max(0, (timeSec - line.timeSec) / Math.max(0.001, lineEnd - line.timeSec)));
          const pct = `${(progress * 100).toFixed(1)}%`;
          return (
            <p
              key={idx}
              data-testid="tv-lyric-active"
              style={{
                fontSize: "clamp(3.8vh, 6.8vw, 10vh)",
                fontWeight: 900,
                lineHeight: 1.12,
                margin: "0.6vh 0",
                letterSpacing: "0.01em",
                // Karaoke wipe: filled portion in bright yellow, the rest near-white.
                backgroundImage: `linear-gradient(90deg, #fde047 ${pct}, rgba(255,255,255,0.95) ${pct})`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                filter: "drop-shadow(0 0.4vh 1.2vh rgba(0,0,0,0.9))",
              }}
            >
              {line.text}
            </p>
          );
        }

        const upcoming = distance > 0;
        const opacity = upcoming ? Math.max(0.4, 0.9 - (distance - 1) * 0.14) : 0.3;
        return (
          <p
            key={start + i}
            data-testid={upcoming ? "tv-lyric-next" : "tv-lyric-past"}
            style={{
              fontSize: "clamp(1.9vh, 2.7vw, 4vh)",
              fontWeight: 600,
              lineHeight: 1.2,
              margin: 0,
              opacity,
              textShadow: "0 0.3vh 1vh rgba(0,0,0,0.9)",
              transition: "opacity 200ms ease",
            }}
          >
            {line.text}
          </p>
        );
      })}
    </div>
  );
}

export default TvLyrics;
