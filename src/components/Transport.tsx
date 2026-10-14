"use client";

// Bottom transport bar: restart / play-pause / stop / next. ArrowLeft and
// ArrowRight move between buttons (skipping disabled ones), Enter activates
// the focused button natively. The currently loaded song is displayed above
// the controls in large TV-readable text.
import { useRef, useState } from "react";

export interface TransportProps {
  isPlaying: boolean;
  hasSong: boolean;
  hasNext: boolean;
  title: string | null;
  onPrev: () => void;
  onPlayPause: () => void;
  onStop: () => void;
  onNext: () => void;
}

export function Transport({
  isPlaying,
  hasSong,
  hasNext,
  title,
  onPrev,
  onPlayPause,
  onStop,
  onNext,
}: TransportProps) {
  const buttons = [
    { label: "⏮ Restart", aria: "Restart song from the beginning", onClick: onPrev, disabled: !hasSong },
    {
      label: isPlaying ? "⏸ Pause" : "▶ Play",
      aria: isPlaying ? "Pause" : "Play",
      onClick: onPlayPause,
      disabled: !isPlaying && !hasSong,
    },
    { label: "⏹ Stop", aria: "Stop", onClick: onStop, disabled: !hasSong },
    { label: "⏭ Next", aria: "Play next song in queue", onClick: onNext, disabled: !hasNext },
  ];

  const firstEnabled = buttons.findIndex((b) => !b.disabled);
  const [rawFocusIdx, setFocusIdx] = useState(1);
  // Never keep the roving cursor on a disabled button.
  const focusIdx = buttons[rawFocusIdx] && !buttons[rawFocusIdx].disabled ? rawFocusIdx : firstEnabled;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < buttons.length; i += dir) {
      if (!buttons[i].disabled) {
        setFocusIdx(i);
        refs.current[i]?.focus();
        return;
      }
    }
  };

  return (
    <div
      data-testid="transport"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1vh",
        padding: "1vh 3vw",
      }}
    >
      <p
        aria-live="polite"
        style={{
          fontSize: "1.4vw",
          fontWeight: 600,
          margin: 0,
          opacity: title ? 0.95 : 0.5,
          minHeight: "1.6em",
        }}
      >
        {title ?? "No song loaded"}
      </p>
      <div role="toolbar" aria-label="Playback" style={{ display: "flex", gap: "1vw" }}>
        {buttons.map((btn, i) => (
          <button
            key={btn.aria}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            tabIndex={i === focusIdx ? 0 : -1}
            aria-label={btn.aria}
            disabled={btn.disabled}
            onFocus={() => setFocusIdx(i)}
            onClick={btn.onClick}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            style={{
              padding: "1.2vh 1.6vw",
              fontSize: "1.5vw",
              fontWeight: 700,
              color: btn.disabled ? "#666" : "#fafafa",
              background: btn.disabled ? "#14161f" : "#1b2030",
              border: "2px solid #39415a",
              borderRadius: "0.6vw",
              cursor: btn.disabled ? "default" : "pointer",
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
