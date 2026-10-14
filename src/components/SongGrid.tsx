"use client";

// Scrollable song list for the TV. Every row carries three buttons — Play
// (the row itself), "+ Fav", and "+ Queue" — all reachable with arrow keys
// and activated with Enter (native button behavior); no hover-only
// affordances. ArrowUp/ArrowDown move between rows (roving tabIndex),
// ArrowRight steps through the row's actions Play → Fav → Queue, and
// ArrowLeft walks back toward the row.
import { useRef, useState } from "react";
import type { SongMeta } from "@/lib/scanner";

export interface SongGridProps {
  songs: SongMeta[];
  onPlay: (song: SongMeta) => void;
  onQueue: (song: SongMeta) => void;
  onToggleFavorite: (song: SongMeta) => void;
  isFavorite: (songId: string) => boolean;
}

// A full local library can hold tens of thousands of files; rendering every
// row would freeze the TV browser. Cap the rendered window — search narrows
// the rest.
const MAX_ROWS = 200;

const rowButtonStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  minWidth: 0,
  textAlign: "left",
  padding: "1.1vh 1vw",
  fontSize: "1.4vw",
  fontWeight: 600,
  color: active ? "#0b0b12" : "#fafafa",
  background: active ? "#f7c948" : "transparent",
  border: "none",
  borderRadius: "0.5vw",
  cursor: "pointer",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

// Favorites stand out filled; pressing (or focusing) the button inverts
// the colors exactly like the active row does.
const favButtonStyle = (active: boolean, favorited: boolean): React.CSSProperties => ({
  flexShrink: 0,
  padding: "1.1vh 0.8vw",
  fontSize: "1.2vw",
  fontWeight: 700,
  color: active ? "#0b0b12" : favorited ? "#0b0b12" : "#f7c948",
  background: active ? "#f7c948" : favorited ? "#f7c948" : "transparent",
  border: "2px solid #f7c948",
  borderRadius: "0.5vw",
  cursor: "pointer",
});

const queueButtonStyle = (active: boolean): React.CSSProperties => ({
  flexShrink: 0,
  padding: "1.1vh 0.8vw",
  fontSize: "1.2vw",
  fontWeight: 700,
  color: active ? "#0b0b12" : "#f7c948",
  background: active ? "#f7c948" : "transparent",
  border: "2px solid #f7c948",
  borderRadius: "0.5vw",
  cursor: "pointer",
});

export function SongGrid({ songs, onPlay, onQueue, onToggleFavorite, isFavorite }: SongGridProps) {
  const rows = songs.slice(0, MAX_ROWS);
  const [rawFocusIdx, setFocusIdx] = useState(0);
  const focusIdx = Math.min(rawFocusIdx, Math.max(rows.length - 1, 0));
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const favRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const queueRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusRow = (i: number) => {
    if (rows.length === 0) return;
    const clamped = Math.max(0, Math.min(i, rows.length - 1));
    setFocusIdx(clamped);
    rowRefs.current[clamped]?.focus();
  };

  return (
    <div data-testid="song-grid" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      {rows.length === 0 ? (
        <p style={{ padding: "2vh 1vw", fontSize: "1.4vw", opacity: 0.6 }}>
          No songs found.
        </p>
      ) : (
        <ul role="listbox" aria-label="Songs" style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.4vh" }}>
          {rows.map((song, i) => {
            const active = i === focusIdx;
            const favorite = isFavorite(song.id);
            return (
              <li key={song.id} role="option" aria-selected={active} style={{ display: "flex", alignItems: "center", gap: "0.6vw", padding: "0 0.4vw" }}>
                <button
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  type="button"
                  tabIndex={active ? 0 : -1}
                  onFocus={() => setFocusIdx(i)}
                  onClick={() => onPlay(song)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      focusRow(i + 1);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      focusRow(i - 1);
                    } else if (e.key === "ArrowRight") {
                      e.preventDefault();
                      favRefs.current[i]?.focus();
                    }
                  }}
                  style={rowButtonStyle(active)}
                >
                  {song.title}
                  {song.artist ? (
                    <span style={{ fontWeight: 400, opacity: 0.75 }}> — {song.artist}</span>
                  ) : null}
                </button>
                <button
                  ref={(el) => {
                    favRefs.current[i] = el;
                  }}
                  type="button"
                  tabIndex={-1}
                  aria-label={favorite ? `Unfavorite ${song.title}` : `Favorite ${song.title}`}
                  onClick={() => onToggleFavorite(song)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      rowRefs.current[i]?.focus();
                    } else if (e.key === "ArrowRight") {
                      e.preventDefault();
                      queueRefs.current[i]?.focus();
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      focusRow(i + 1);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      focusRow(i - 1);
                    }
                  }}
                  style={favButtonStyle(active, favorite)}
                >
                  {favorite ? "♥ Fav" : "♡ Fav"}
                </button>
                <button
                  ref={(el) => {
                    queueRefs.current[i] = el;
                  }}
                  type="button"
                  tabIndex={-1}
                  aria-label={`Queue ${song.title}`}
                  onClick={() => onQueue(song)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      favRefs.current[i]?.focus();
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      focusRow(i + 1);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      focusRow(i - 1);
                    }
                  }}
                  style={queueButtonStyle(false)}
                >
                  + Queue
                </button>
              </li>
            );
          })}
          {songs.length > MAX_ROWS && (
            <li style={{ padding: "1vh 1vw", fontSize: "1.1vw", opacity: 0.6 }}>
              Showing {MAX_ROWS} of {songs.length} — search to narrow down
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
