"use client";

// Cosmetic fun score shown when a song ends. R-nomic: there is NO
// microphone capture and NO pitch analysis — the number is a joke drawn from
// a random source. The UI says so explicitly ("Fun score — cosmetic only")
// so nobody mistakes it for real singing feedback.
//
// Placement is owned by TvShell: it renders this in the bottom band of the
// lyric stage so the AutoAdvanceOverlay's centered countdown card keeps the
// middle of the screen. The score is regenerated only when the ended song
// changes (`endedId`), so ticks from the countdown never re-roll it (stable
// keys / no focus churn, R-tv). The text is plain non-interactive content, so
// keyboard focus is untouched and the Cancel button stays reachable.
import { useMemo } from "react";
import { rollScore } from "@/lib/score";

export function Score({
  endedId,
  rand = Math.random,
}: {
  /** The song that just ended; a new id re-rolls the score exactly once. */
  endedId: string;
  /** Random source (injectable for tests); defaults to Math.random. */
  rand?: () => number;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-roll keyed on endedId only
  const { score, reaction } = useMemo(() => rollScore(rand), [endedId]);

  return (
    <div
      data-testid="fun-score"
      role="status"
      aria-label={`Fun score ${score} out of 100, ${reaction} This is a cosmetic score for fun only.`}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "2.4vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.4vh",
        zIndex: 2,
        pointerEvents: "none",
        textAlign: "center",
        textShadow: "0 2px 12px rgba(0,0,0,0.85)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: "1.05vw",
          fontWeight: 700,
          letterSpacing: "0.28em",
          opacity: 0.65,
        }}
      >
        FUN SCORE
      </p>
      <p style={{ margin: 0, fontSize: "4.2vw", fontWeight: 800, lineHeight: 1 }}>
        {score}
        <span style={{ fontSize: "1.6vw", opacity: 0.7 }}> / 100</span>
      </p>
      <p style={{ margin: 0, fontSize: "1.6vw", fontWeight: 700 }}>{reaction}</p>
      <p style={{ margin: 0, fontSize: "0.95vw", opacity: 0.6 }}>
        Cosmetic only — no microphone, just for fun 🎤
      </p>
    </div>
  );
}

export default Score;
