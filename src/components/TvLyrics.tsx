"use client";

// src/components/TvLyrics.tsx
// Lyrics-first stage for the TV: the active line is huge and bold with a
// left-to-right karaoke wipe that tracks the real playback time; the next line
// sits below, smaller and dimmer, so the singer can prepare. Before the first
// line an intro countdown counts down; a lyric-less song shows the
// instrumental state.
import { activeLineIndex, introCountdown, type LyricLine } from "@/lib/lyrics";

export interface TvLyricsProps {
  lines: LyricLine[];
  /** Playback position in seconds, already adjusted by the host lyric offset. */
  timeSec: number;
}

export function TvLyrics({ lines, timeSec }: TvLyricsProps) {
  const active = activeLineIndex(lines, timeSec);
  const next = active >= 0 ? lines[active + 1] : lines[0];
  const countdown = introCountdown(lines, timeSec);

  if (lines.length === 0) {
    return (
      <p data-testid="tv-instrumental" style={{ fontSize: "5vh", opacity: 0.7, margin: 0, textAlign: "center" }}>
        Instrumental — no lyrics
      </p>
    );
  }

  if (countdown !== null) {
    return (
      <p
        data-testid="tv-intro-countdown"
        aria-label="Get ready"
        style={{ fontSize: "20vh", fontWeight: 900, lineHeight: 1, margin: 0, color: "#fde047", textAlign: "center" }}
      >
        {countdown}
      </p>
    );
  }

  const line = lines[Math.max(0, active)];
  const lineEnd = next ? next.timeSec : line.timeSec + 4;
  const progress = Math.min(1, Math.max(0, (timeSec - line.timeSec) / Math.max(0.001, lineEnd - line.timeSec)));
  const pct = `${(progress * 100).toFixed(1)}%`;

  return (
    <div
      data-testid="tv-lyrics"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "3vh",
        width: "100%",
        textAlign: "center",
      }}
    >
      <p
        data-testid="tv-lyric-active"
        style={{
          fontSize: "clamp(4vh, 8vw, 13vh)",
          fontWeight: 900,
          lineHeight: 1.15,
          margin: 0,
          letterSpacing: "0.01em",
          // Karaoke wipe: filled portion in bright yellow, the rest near-white.
          backgroundImage: `linear-gradient(90deg, #fde047 ${pct}, rgba(255,255,255,0.92) ${pct})`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          filter: "drop-shadow(0 0.4vh 1.2vh rgba(0,0,0,0.9))",
          transition: "opacity 160ms ease",
        }}
      >
        {line.text}
      </p>
      {next && (
        <p
          data-testid="tv-lyric-next"
          style={{
            fontSize: "clamp(2.4vh, 3.6vw, 5.6vh)",
            fontWeight: 600,
            opacity: 0.62,
            margin: 0,
            textShadow: "0 0.3vh 1vh rgba(0,0,0,0.9)",
            transition: "opacity 160ms ease",
          }}
        >
          {next.text}
        </p>
      )}
    </div>
  );
}

export default TvLyrics;
