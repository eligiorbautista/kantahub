"use client";

// Horizontal song strips for the TV home shell: Favorites (user-pinned
// songs) and Recently played (newest first). Both are plain button rows
// in the same visual language as the library/queue lists — ArrowLeft and
// ArrowRight rove a tabIndex cursor between chips, Enter activates the
// focused chip natively, and no control is hover-only. Empty rows render
// nothing so a fresh install looks exactly like it did before.
import { useRef, useState } from "react";
import type { SongMeta } from "@/lib/scanner";

export interface FavoritesProps {
  songs: SongMeta[];
  onPlay: (song: SongMeta) => void;
}

interface SongRowProps extends FavoritesProps {
  label: string;
  testId: string;
}

// Long libraries would otherwise render thousands of chips; the strip is
// a convenience, the searchable library below is the full browser.
const MAX_ITEMS = 50;

const chipStyle = (active: boolean): React.CSSProperties => ({
  flexShrink: 0,
  maxWidth: "18vw",
  padding: "1vh 1.2vw",
  fontSize: "1.2vw",
  fontWeight: 600,
  color: active ? "#0b0b12" : "#fafafa",
  background: active ? "#f7c948" : "#1b2030",
  border: "none",
  borderRadius: "0.5vw",
  cursor: "pointer",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

function SongRow({ label, testId, songs, onPlay }: SongRowProps) {
  const items = songs.slice(0, MAX_ITEMS);
  const [rawFocusIdx, setFocusIdx] = useState(0);
  const focusIdx = Math.min(rawFocusIdx, Math.max(items.length - 1, 0));
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusItem = (i: number) => {
    if (items.length === 0) return;
    const clamped = Math.max(0, Math.min(i, items.length - 1));
    setFocusIdx(clamped);
    refs.current[clamped]?.focus();
  };

  if (items.length === 0) return null;

  return (
    <div data-testid={testId}>
      <h2 style={{ fontSize: "1.2vw", fontWeight: 700, margin: "0 0 0.6vh", opacity: 0.85 }}>{label}</h2>
      <ul
        role="listbox"
        aria-label={label}
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          gap: "0.6vw",
          overflowX: "auto",
        }}
      >
        {items.map((song, i) => {
          const active = i === focusIdx;
          return (
            <li key={song.id} role="option" aria-selected={active} style={{ flexShrink: 0 }}>
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                tabIndex={active ? 0 : -1}
                onFocus={() => setFocusIdx(i)}
                onClick={() => onPlay(song)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") {
                    e.preventDefault();
                    focusItem(i + 1);
                  } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    focusItem(i - 1);
                  }
                }}
                style={chipStyle(active)}
              >
                {song.title}
                {song.artist ? <span style={{ fontWeight: 400, opacity: 0.75 }}> — {song.artist}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Favorites({ songs, onPlay }: FavoritesProps) {
  return <SongRow label="Favorites" testId="favorites-row" songs={songs} onPlay={onPlay} />;
}

export function RecentlyPlayed({ songs, onPlay }: FavoritesProps) {
  return <SongRow label="Recently played" testId="recently-played-row" songs={songs} onPlay={onPlay} />;
}
