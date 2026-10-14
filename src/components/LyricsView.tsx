import { activeLineIndex, introCountdown, type LyricLine } from "@/lib/lyrics";

export interface LyricsViewProps {
  lines: LyricLine[];
  timeSec: number;
}

// Presentational lyric display for the TV: the active line is rendered
// large at the optical pole (slightly above center), the upcoming line
// smaller below it. With no lyrics the song is instrumental; before the
// first line a numeric intro countdown counts down to the opening lyric.
export function LyricsView({ lines, timeSec }: LyricsViewProps) {
  const active = activeLineIndex(lines, timeSec);
  const next = active >= 0 ? lines[active + 1] : lines[0];
  const countdown = introCountdown(lines, timeSec);

  return (
    <div
      data-testid="lyrics-view"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "4vh",
        minHeight: "100%",
        textAlign: "center",
        color: "#fff",
        textShadow: "0 2px 12px rgba(0,0,0,0.8)",
      }}
    >
      {lines.length === 0 ? (
        <p style={{ fontSize: "4vw", opacity: 0.7, margin: 0 }}>
          Instrumental — no lyrics
        </p>
      ) : countdown !== null ? (
        <p
          aria-label="Get ready"
          data-testid="countdown"
          style={{ fontSize: "10vw", fontWeight: 700, lineHeight: 1, margin: 0, opacity: 0.9 }}
        >
          {countdown}
        </p>
      ) : (
        <p
          data-testid="lyric-active"
          style={{ fontSize: "6vw", fontWeight: 700, lineHeight: 1.2, margin: 0 }}
        >
          {lines[active].text}
        </p>
      )}
      {lines.length > 0 && next && (
        <p
          data-testid="lyric-next"
          style={{ fontSize: "2.5vw", fontWeight: 400, opacity: 0.6, margin: 0 }}
        >
          {next.text}
        </p>
      )}
    </div>
  );
}

export default LyricsView;
