"use client";

// src/components/Controller.tsx
// The controller screen (/): search songs, enter song numbers, build and manage
// the queue, and drive playback from a phone, tablet, laptop, or desktop. It
// holds no audio — the TV display (/tv) plays the music — it just sends room
// commands and mirrors the shared state.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRoom } from "@/lib/useRoom";
import { ROOM_CODE, ROOM_ID } from "@/lib/room";
import { searchSongs, resolveSongs, findByNumber, songLabel } from "@/lib/songsClient";
import type { SongMeta } from "@/lib/scanner";
import { branding } from "@/lib/branding";
import { Songbook } from "@/components/Songbook";
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PrevIcon,
  StopIcon,
  SearchIcon,
  BookIcon,
  MusicIcon,
  CloseIcon,
} from "@/components/Icons";

const PAGE_SIZE = 40;

export function Controller() {
  const { state: room, send, connected } = useRoom(ROOM_ID);

  const [singer, setSinger] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [songbookOpen, setSongbookOpen] = useState(false);
  const [songsById, setSongsById] = useState<Map<string, SongMeta>>(new Map());
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounced paged search.
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      setLoading(true);
      searchSongs(query, PAGE_SIZE, offset)
        .then((page) => {
          if (cancelled) return;
          setResults(page.items);
          setTotal(page.total);
        })
        .catch((err) => console.error("search failed:", err))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, offset]);

  // Resolve queue entries to metadata.
  useEffect(() => {
    const ids = (room?.queue ?? []).map((e) => e.songId);
    const missing = ids.filter((id) => !songsById.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    void resolveSongs(missing).then((songs) => {
      if (cancelled) return;
      setSongsById((prev) => {
        const next = new Map(prev);
        for (const s of songs) next.set(s.id, s);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [room, songsById]);

  const queuedIds = useMemo(() => new Set((room?.queue ?? []).map((e) => e.songId)), [room?.queue]);

  const remember = useCallback((song: SongMeta) => {
    setSongsById((prev) => new Map(prev).set(song.id, song));
  }, []);

  const addSong = useCallback(
    async (song: SongMeta) => {
      if (queuedIds.has(song.id)) {
        setFeedback("Already in queue");
        return "duplicate" as const;
      }
      remember(song);
      const next = await send({ kind: "enqueue", songId: song.id, singer: singer.trim() });
      if (!next) {
        setFeedback("Song not found");
        return "error" as const;
      }
      setFeedback(`Added “${song.title}” to the queue`);
      return "added" as const;
    },
    [queuedIds, send, singer, remember],
  );

  const playNow = useCallback(
    (song: SongMeta) => {
      remember(song);
      void send({ kind: "play", songId: song.id, singer: singer.trim(), countdownSec: 5 });
      setFeedback("Now playing");
    },
    [send, singer, remember],
  );

  const submitNumber = useCallback(async () => {
    const q = numberInput.trim();
    if (!q) return;
    const song = (await findByNumber(q)) ?? (await searchSongs(q, 10, 0)).items[0] ?? null;
    if (!song) {
      setFeedback("Song not found");
      return;
    }
    await addSong(song);
    setNumberInput("");
  }, [numberInput, addSong]);

  const currentSong = room?.currentId ? songsById.get(room.currentId) : undefined;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#0b0b12",
        color: "#fafafa",
        padding: "1.6rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.4rem",
        maxWidth: "60rem",
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800 }}>{branding.name}</h1>
        <span
          title={connected ? "Connected" : "Reconnecting…"}
          style={{
            width: "0.6rem",
            height: "0.6rem",
            borderRadius: "50%",
            background: connected ? "#4ade80" : "#f87171",
          }}
        />
        <span style={{ opacity: 0.6, fontSize: "0.9rem" }}>Room {ROOM_CODE}</span>
        <a href="/tv" style={{ marginLeft: "auto", color: "#93c5fd", fontSize: "0.9rem" }}>
          TV screen
        </a>
        <a href="/admin" style={{ color: "#93c5fd", fontSize: "0.9rem" }}>
          Admin
        </a>
      </header>

      {/* Now playing + transport */}
      <section style={card}>
        <p style={{ margin: 0, fontSize: "0.8rem", letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
          Now Singing
        </p>
        <p style={{ margin: "0.2rem 0 0.8rem", fontSize: "1.3rem", fontWeight: 800 }}>
          {room?.currentId
            ? `${room.currentSinger ? `${room.currentSinger} — ` : ""}${songLabel({
                title: currentSong?.title ?? "…",
                artist: currentSong?.artist ?? "",
              })}`
            : "Nothing playing"}
        </p>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={() => void send({ kind: "restart" })} style={btn} aria-label="Restart">
            <PrevIcon size={20} /> Restart
          </button>
          <button
            type="button"
            onClick={() => void send({ kind: room?.isPlaying ? "pause" : "resume" })}
            style={btnPrimary}
            aria-label={room?.isPlaying ? "Pause" : "Play"}
          >
            {room?.isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
            {room?.isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={() => void send({ kind: "next", countdownSec: 5 })} style={btn} aria-label="Next">
            <NextIcon size={20} /> Next
          </button>
          <button type="button" onClick={() => void send({ kind: "stop" })} style={btn} aria-label="Stop">
            <StopIcon size={20} /> Stop
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
            <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={room?.volume ?? 0.8}
              onChange={(e) => void send({ kind: "setVolume", volume: Number(e.target.value) })}
              style={{ width: "8rem" }}
            />
          </label>
        </div>
      </section>

      {/* Singer + add songs */}
      <section style={card}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>Singer (for the next song you add)</span>
          <input
            value={singer}
            onChange={(e) => setSinger(e.target.value)}
            placeholder="e.g. Juan"
            style={input}
          />
        </label>

        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "0.8rem" }}>
          <div style={{ position: "relative", flex: "1 1 14rem" }}>
            <span style={{ position: "absolute", left: "0.6rem", top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}>
              <SearchIcon size={18} />
            </span>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOffset(0);
              }}
              placeholder="Search title or artist…"
              style={{ ...input, paddingLeft: "2.2rem" }}
            />
          </div>
          <button type="button" onClick={() => setSongbookOpen(true)} style={btn}>
            <BookIcon size={18} /> Songbook
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
          <input
            value={numberInput}
            onChange={(e) => setNumberInput(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitNumber();
            }}
            inputMode="numeric"
            placeholder="Song number"
            style={{ ...input, flex: "0 1 10rem" }}
          />
          <button type="button" onClick={() => void submitNumber()} style={btnPrimary}>
            <MusicIcon size={18} /> Add number
          </button>
        </div>

        {feedback && (
          <p role="status" style={{ margin: "0.6rem 0 0", fontSize: "0.9rem", color: "#93c5fd" }}>
            {feedback}
          </p>
        )}

        <ul style={{ listStyle: "none", margin: "0.8rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {results.map((song) => {
            const inQueue = queuedIds.has(song.id);
            return (
              <li key={song.id}>
                <div style={row}>
                  <span style={{ opacity: 0.55, minWidth: "4.5ch", textAlign: "right", fontSize: "0.85rem" }}>
                    {song.number ?? "—"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {songLabel(song)}
                  </span>
                  {inQueue && <span style={{ color: "#4ade80", fontSize: "0.8rem" }}>In queue</span>}
                  <button type="button" onClick={() => void addSong(song)} style={btnSmall}>
                    Add
                  </button>
                  <button type="button" onClick={() => playNow(song)} style={btnSmallAlt}>
                    Play
                  </button>
                </div>
              </li>
            );
          })}
          {!loading && results.length === 0 && (
            <li style={{ opacity: 0.6, fontSize: "0.95rem" }}>No songs match “{query}”.</li>
          )}
        </ul>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", marginTop: "0.8rem" }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            style={page <= 1 ? btnDisabled : btnSmall}
          >
            Prev
          </button>
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
            Page {page} / {pageCount} · {total} songs
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            style={page >= pageCount ? btnDisabled : btnSmall}
          >
            Next
          </button>
        </div>
      </section>

      {/* Queue */}
      <section style={card}>
        <h2 style={{ margin: "0 0 0.6rem", fontSize: "1.1rem" }}>
          Queue ({room?.queue.length ?? 0})
        </h2>
        {(room?.queue.length ?? 0) === 0 ? (
          <p style={{ opacity: 0.6, margin: 0 }}>The queue is empty.</p>
        ) : (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {room!.queue.map((entry, i) => {
              const song = songsById.get(entry.songId);
              return (
                <li key={`${entry.songId}-${i}`}>
                  <div style={row}>
                    <span style={{ opacity: 0.6, minWidth: "2ch", textAlign: "right" }}>{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {song ? songLabel(song) : entry.songId}
                      </span>
                      {entry.singer && <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>{entry.singer}</span>}
                    </span>
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => void send({ kind: "reorder", from: i, to: i - 1 })}
                      style={i === 0 ? btnDisabled : btnSmall}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === room!.queue.length - 1}
                      onClick={() => void send({ kind: "reorder", from: i, to: i + 1 })}
                      style={i === room!.queue.length - 1 ? btnDisabled : btnSmall}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => void send({ kind: "play", songId: entry.songId, singer: entry.singer, countdownSec: 5 })}
                      style={btnSmallAlt}
                    >
                      Play
                    </button>
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => void send({ kind: "dequeue", index: i })}
                      style={btnSmall}
                    >
                      <CloseIcon size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {(room?.queue.length ?? 0) > 0 && (
          <button type="button" onClick={() => void send({ kind: "clearQueue" })} style={{ ...btn, marginTop: "0.8rem" }}>
            Clear queue
          </button>
        )}
      </section>

      {songbookOpen && (
        <Songbook
          queuedIds={queuedIds}
          onAdd={addSong}
          onPlayNow={playNow}
          onClose={() => setSongbookOpen(false)}
          performing={room?.phase === "countdown" || !!room?.isPlaying}
          feedback={feedback}
        />
      )}
    </main>
  );
}

const card: CSSProperties = {
  background: "#14141f",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "0.8rem",
  padding: "1rem",
};

const input: CSSProperties = {
  background: "#0b0b12",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "0.5rem",
  padding: "0.6rem 0.8rem",
  color: "#fafafa",
  fontSize: "1rem",
  width: "100%",
  boxSizing: "border-box",
};

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  background: "rgba(255,255,255,0.04)",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.7rem",
};

const btn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  background: "rgba(255,255,255,0.1)",
  color: "#fafafa",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.9rem",
  fontSize: "0.95rem",
  cursor: "pointer",
};

const btnPrimary: CSSProperties = {
  ...btn,
  background: "#3b82f6",
  borderColor: "#3b82f6",
  fontWeight: 700,
};

const btnSmall: CSSProperties = {
  ...btn,
  padding: "0.35rem 0.6rem",
  fontSize: "0.85rem",
};

const btnSmallAlt: CSSProperties = {
  ...btnSmall,
  background: "#ef4444",
  borderColor: "#ef4444",
};

const btnDisabled: CSSProperties = {
  ...btnSmall,
  opacity: 0.4,
  cursor: "default",
};

export default Controller;
