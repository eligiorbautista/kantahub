"use client";

// src/components/Songbook.tsx
// TV-remote-friendly songbook: paged server-side search (fast with ~48k songs),
// a large numeric keypad for song-number entry, D-pad navigable rows, and a
// simple detail action menu (Add to queue / Play now / Back). It is rendered as
// an overlay, so the karaoke screen behind it never stops.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { SongMeta } from "@/lib/scanner";
import { searchSongs, findByNumber, songLabel } from "@/lib/songsClient";
import { NumberPad } from "@/components/NumberPad";
import { SearchIcon, CloseIcon, MusicIcon } from "@/components/Icons";

const PAGE_SIZE = 24;

export interface SongbookProps {
  queuedIds: Set<string>;
  onAdd(song: SongMeta): Promise<"added" | "duplicate" | "error"> | "added" | "duplicate" | "error";
  onPlayNow(song: SongMeta): void;
  onClose(): void;
  /** True while someone is singing (or about to) — "Play now" then needs a confirm. */
  performing?: boolean;
  /** Text shown briefly after an add (kept in the parent so it can persist). */
  feedback?: string | null;
}

type Mode = "search" | "number";

export function Songbook({ queuedIds, onAdd, onPlayNow, onClose, performing = false, feedback }: SongbookProps) {
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SongMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SongMeta | null>(null);
  const [confirmPlay, setConfirmPlay] = useState<SongMeta | null>(null);
  const [number, setNumber] = useState("");
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounced paged search.
  useEffect(() => {
    if (mode !== "search") return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      setLoading(true);
      searchSongs(query, PAGE_SIZE, offset)
        .then((page) => {
          if (cancelled) return;
          setItems(page.items);
          setTotal(page.total);
        })
        .catch((err) => console.error("songbook search failed:", err))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, offset, mode]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  const add = useCallback(
    async (song: SongMeta) => {
      const result = await onAdd(song);
      setLocalFeedback(
        result === "duplicate" ? "Already in queue" : result === "error" ? "Song not found" : "Song added to queue",
      );
    },
    [onAdd],
  );

  const submitNumber = useCallback(async () => {
    const q = number.trim();
    if (!q) return;
    setLocalFeedback(null);
    // An exact song-number match wins; otherwise fall back to a text search.
    const song = (await findByNumber(q)) ?? (await searchSongs(q, 10, 0)).items[0] ?? null;
    if (!song) {
      setLocalFeedback("Song not found");
      return;
    }
    await add(song);
    setNumber("");
  }, [number, add]);

  const queuedCount = queuedIds.size;

  return (
    <div
      data-testid="songbook"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        background: "rgba(6,8,16,0.96)",
        color: "#fff",
        padding: "max(2.4vh, 1.6vw) max(3vw, 2.4vh)",
        gap: "2vh",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: "2vw", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "3.2vh", fontWeight: 800 }}>Songbook</h2>
        <div style={{ display: "flex", gap: "1vw" }}>
          <button
            type="button"
            data-focusable="true"
            onClick={() => setMode("search")}
            style={tabStyle(mode === "search")}
          >
            <SearchIcon size="2.2vh" /> Search
          </button>
          <button
            type="button"
            data-focusable="true"
            onClick={() => setMode("number")}
            style={tabStyle(mode === "number")}
          >
            <MusicIcon size="2.2vh" /> Song number
          </button>
        </div>
        <span style={{ opacity: 0.6, fontSize: "2vh", marginLeft: "auto" }}>
          {queuedCount} in queue
        </span>
        <button type="button" data-focusable="true" onClick={onClose} style={closeStyle} aria-label="Close songbook">
          <CloseIcon size="2.6vh" />
        </button>
      </header>

      {mode === "search" ? (
        <>
          <input
            ref={searchRef}
            data-focusable="true"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
            placeholder="Search by title or artist…"
            aria-label="Search songs"
            style={{
              fontSize: "3vh",
              padding: "1.6vh 2vh",
              borderRadius: "1.2vh",
              border: "0.2vh solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <ul className="songbook-list">
            {items.map((song) => {
              const inQueue = queuedIds.has(song.id);
              return (
                <li key={song.id}>
                  <button
                    type="button"
                    data-focusable="true"
                    onClick={() => setSelected(song)}
                    style={rowStyle(inQueue)}
                  >
                    <span style={{ opacity: 0.65, minWidth: "7ch", textAlign: "right" }}>{song.number ?? "—"}</span>
                    <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {songLabel(song)}
                    </span>
                    {inQueue && <span style={{ color: "#4ade80", fontSize: "1.8vh" }}>In queue</span>}
                  </button>
                </li>
              );
            })}
            {!loading && items.length === 0 && (
              <li style={{ opacity: 0.6, fontSize: "2.4vh" }}>No songs match “{query}”.</li>
            )}
          </ul>
          <footer style={{ display: "flex", alignItems: "center", gap: "2vw", justifyContent: "center" }}>
            <button
              type="button"
              data-focusable="true"
              disabled={page <= 1}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              style={navStyle(page <= 1)}
            >
              Prev
            </button>            <span style={{ fontSize: "2.2vh", opacity: 0.75 }}>
              Page {page} / {pageCount} · {total} songs
            </span>
            <button
              type="button"
              data-focusable="true"
              disabled={page >= pageCount}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              style={navStyle(page >= pageCount)}
            >
              Next
            </button>
          </footer>
        </>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <NumberPad value={number} onChange={setNumber} onSubmit={() => void submitNumber()} feedback={localFeedback} />
        </div>
      )}

      {selected && (
        <div style={menuBackdrop} onClick={() => setSelected(null)}>
          <div style={menuStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: "3vh" }}>{selected.title}</h3>
            <p style={{ margin: 0, opacity: 0.75, fontSize: "2.4vh" }}>
              {selected.number ? `#${selected.number} · ` : ""}
              {selected.artist || "Unknown artist"}
            </p>
            <div style={menuActions}>
              <button type="button" data-focusable="true" onClick={() => void add(selected)} style={actionStyle("#3b82f6")}>
                Add to queue
              </button>
              <button
                type="button"
                data-focusable="true"
                onClick={() => {
                  if (performing) {
                    setConfirmPlay(selected);
                    setSelected(null);
                  } else {
                    const s = selected;
                    setSelected(null);
                    onPlayNow(s);
                  }
                }}
                style={actionStyle("#ef4444")}
              >
                Play now
              </button>
              <button type="button" data-focusable="true" onClick={() => setSelected(null)} style={actionStyle("#334155")}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmPlay && (
        <div style={menuBackdrop}>
          <div style={menuStyle}>
            <h3 style={{ margin: 0, fontSize: "3vh" }}>Interrupt the current song?</h3>
            <p style={{ margin: 0, opacity: 0.8, fontSize: "2.4vh" }}>
              “{confirmPlay.title}” will start after the countdown, and the song on stage will stop.
            </p>
            <div style={menuActions}>
              <button
                type="button"
                data-focusable="true"
                onClick={() => {
                  const s = confirmPlay;
                  setConfirmPlay(null);
                  onPlayNow(s);
                }}
                style={actionStyle("#ef4444")}
              >
                Yes, play now
              </button>
              <button type="button" data-focusable="true" onClick={() => setConfirmPlay(null)} style={actionStyle("#334155")}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {(localFeedback ?? feedback) && !selected && (
        <p
          role="status"
          style={{
            position: "absolute",
            bottom: "2.4vh",
            left: "50%",
            transform: "translateX(-50%)",
            margin: 0,
            fontSize: "2.4vh",
            background: "rgba(0,0,0,0.7)",
            padding: "1vh 2vh",
            borderRadius: "1vh",
          }}
        >
          {localFeedback ?? feedback}
        </p>
      )}
    </div>
  );
}

const tabStyle = (active: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.8ch",
  fontSize: "2.4vh",
  padding: "1vh 2vh",
  borderRadius: "1vh",
  border: "0.2vh solid rgba(255,255,255,0.2)",
  background: active ? "#3b82f6" : "rgba(255,255,255,0.08)",
  color: "#fff",
  cursor: "pointer",
});

const closeStyle: CSSProperties = {
  fontSize: "2.4vh",
  padding: "1vh 1.6vh",
  borderRadius: "1vh",
  border: "0.2vh solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  cursor: "pointer",
};

const rowStyle = (inQueue: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "1.6ch",
  width: "100%",
  fontSize: "2.4vh",
  padding: "1.4vh 2vh",
  borderRadius: "1vh",
  border: inQueue ? "0.2vh solid #4ade80" : "0.2vh solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  cursor: "pointer",
});

const navStyle = (disabled: boolean): CSSProperties => ({
  fontSize: "2.4vh",
  padding: "1.2vh 3vh",
  borderRadius: "1vh",
  border: "0.2vh solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.08)",
  color: disabled ? "rgba(255,255,255,0.35)" : "#fff",
  cursor: disabled ? "default" : "pointer",
});

const menuBackdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const menuStyle: CSSProperties = {
  background: "#111827",
  border: "0.2vh solid rgba(255,255,255,0.18)",
  borderRadius: "1.6vh",
  padding: "3vh 3.4vh",
  display: "flex",
  flexDirection: "column",
  gap: "1.2vh",
  width: "min(92vw, 56rem)",
  maxWidth: "92vw",
};

const menuActions: CSSProperties = {
  display: "grid",
  // Wide enough that buttons never clip; narrow screens fall back to one column.
  gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
  gap: "1.2vh",
  marginTop: "1.4vh",
};

const actionStyle = (bg: string): CSSProperties => ({
  fontSize: "2.2vh",
  fontWeight: 700,
  padding: "1.2vh 1.6vh",
  borderRadius: "1vh",
  border: "none",
  background: bg,
  color: "#fff",
  cursor: "pointer",
  width: "100%",
  textAlign: "center",
});

export default Songbook;
