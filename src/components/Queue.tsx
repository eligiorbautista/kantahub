"use client";

// Upcoming-song queue for the TV. Each row has a Play action (Enter on the
// row) and a Remove action, both keyboard-reachable: ArrowUp/ArrowDown move
// between rows, ArrowRight enters the remove button, ArrowLeft returns to
// the row. Enter activates the focused button natively.
import { useRef, useState } from "react";
import type { SongMeta } from "@/lib/scanner";

export interface QueueProps {
  queue: SongMeta[];
  onPlay: (song: SongMeta, index: number) => void;
  onRemove: (index: number) => void;
}

export function Queue({ queue, onPlay, onRemove }: QueueProps) {
  const [focusIdx, setFocusIdx] = useState(0);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const removeRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusRow = (i: number) => {
    if (queue.length === 0) return;
    const clamped = Math.max(0, Math.min(i, queue.length - 1));
    setFocusIdx(clamped);
    rowRefs.current[clamped]?.focus();
  };

  return (
    <div data-testid="queue" style={{ display: "flex", flexDirection: "column", gap: "1vh", minHeight: 0 }}>
      <h2 style={{ fontSize: "1.5vw", fontWeight: 700, margin: 0 }}>Queue</h2>
      {queue.length === 0 ? (
        <p style={{ fontSize: "1.2vw", opacity: 0.6 }}>Queue is empty — add songs from the library.</p>
      ) : (
        <ul style={{ listStyle: "none", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.6vh" }}>
          {queue.map((song, i) => (
            <li key={`${song.id}-${i}`} style={{ display: "flex", alignItems: "center", gap: "0.5vw" }}>
              <button
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                type="button"
                tabIndex={i === Math.min(focusIdx, queue.length - 1) ? 0 : -1}
                onFocus={() => setFocusIdx(i)}
                onClick={() => onPlay(song, i)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    focusRow(i + 1);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    focusRow(i - 1);
                  } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    removeRefs.current[i]?.focus();
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: "left",
                  padding: "0.8vh 0.8vw",
                  fontSize: "1.1vw",
                  fontWeight: 600,
                  color: "#fafafa",
                  background: "#1b2030",
                  border: "none",
                  borderRadius: "0.4vw",
                  cursor: "pointer",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {i + 1}. {song.title}
                {song.artist ? ` — ${song.artist}` : ""}
              </button>
              <button
                ref={(el) => {
                  removeRefs.current[i] = el;
                }}
                type="button"
                tabIndex={-1}
                aria-label={`Remove ${song.title} from queue`}
                onClick={() => onRemove(i)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    rowRefs.current[i]?.focus();
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    focusRow(i + 1);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    focusRow(i - 1);
                  }
                }}
                style={{
                  flexShrink: 0,
                  padding: "0.6vh 0.6vw",
                  fontSize: "1vw",
                  fontWeight: 700,
                  color: "#ff8a80",
                  background: "transparent",
                  border: "2px solid #ff8a80",
                  borderRadius: "0.4vw",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
