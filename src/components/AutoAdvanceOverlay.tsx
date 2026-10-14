"use client";

// Between-songs countdown (R-countdown): shows what plays next, the seconds
// remaining, and the CANCEL button that stops the auto-advance. Pure
// presentation — TvShell owns the countdown lifecycle, because the moment
// of advancing combines the shell's queue state with the player store's
// play action. The cancel button is a plain button in DOM order after the
// library and queue, so Tab reaches it and Enter activates it natively;
// nothing re-keys while the seconds tick, so focus inside survives
// (R-tv). The ticking number is aria-hidden: the "UP NEXT {title}" line and
// the button's label carry the meaning without re-announcing every second.
export function AutoAdvanceOverlay({
  secondsLeft,
  nextTitle,
  onCancel,
}: {
  /** Whole seconds until the next song starts (counts down 5 → 1). */
  secondsLeft: number;
  /** Display title of the next song (already formatted by the shell). */
  nextTitle: string;
  /** CANCEL: stop the auto-advance and keep the current screen. */
  onCancel: () => void;
}) {
  return (
    <div
      data-testid="auto-advance-overlay"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(11, 11, 18, 0.86)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.4vh",
          padding: "3.2vh 3.5vw",
          maxWidth: "44vw",
          background: "#1b2030",
          border: "2px solid #39415a",
          borderRadius: "1vw",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "1.2vw",
            fontWeight: 700,
            letterSpacing: "0.28em",
            opacity: 0.65,
          }}
        >
          UP NEXT
        </p>
        <p style={{ margin: 0, fontSize: "2.4vw", fontWeight: 800, textAlign: "center" }}>
          {nextTitle}
        </p>
        <p
          aria-hidden="true"
          style={{ margin: 0, fontSize: "4.5vw", fontWeight: 800, lineHeight: 1 }}
        >
          {secondsLeft}
        </p>
        <button
          type="button"
          data-testid="auto-advance-cancel"
          aria-label="Cancel auto-advance and stay on this song"
          onClick={onCancel}
          style={{
            padding: "1vh 2vw",
            fontSize: "1.3vw",
            fontWeight: 700,
            color: "#fafafa",
            background: "#14161f",
            border: "2px solid #39415a",
            borderRadius: "0.6vw",
            cursor: "pointer",
          }}
        >
          ✕ Cancel
        </button>
      </div>
    </div>
  );
}
