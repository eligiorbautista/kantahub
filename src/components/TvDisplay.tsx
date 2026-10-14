"use client";

// src/components/TvDisplay.tsx
// The dedicated Smart TV screen (/tv): a clean, fullscreen, lyrics-first stage
// for guests and singers. The background video plays behind large synchronized
// lyrics; compact overlays show who is singing, who is next, and a short queue
// strip. Search / song-number / songbook open as overlays that never stop the
// song. This component owns the audio engine and mirrors the shared room state
// (server-authoritative countdown, playback, queue, volume) so every device
// stays in sync. Everything is reachable with a TV remote (D-pad).
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePlayer } from "@/components/PlayerProvider";
import { useRoom } from "@/lib/useRoom";
import { ROOM_CODE, ROOM_ID } from "@/lib/room";
import { branding } from "@/lib/branding";
import { loadLyricLines } from "@/lib/lyricLoader";
import { resolveSongs, searchSongs, songLabel } from "@/lib/songsClient";
import { useSpatialNav } from "@/lib/useSpatialNav";
import type { SongMeta } from "@/lib/scanner";
import type { LyricLine } from "@/lib/lyrics";
import { BackgroundMedia } from "@/components/BackgroundMedia";
import { TvLyrics } from "@/components/TvLyrics";
import { CountdownScreen } from "@/components/CountdownScreen";
import { Songbook } from "@/components/Songbook";
import { NumberPad } from "@/components/NumberPad";
import { QrPanel } from "@/components/QrPanel";
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
  FlatIcon,
  SharpIcon,
} from "@/components/Icons";

const COUNTDOWN_SECONDS = 5;

type Overlay = "none" | "songbook" | "number" | "queue";

export function TvDisplay({ controllerUrl }: { controllerUrl: string }) {
  const { state: player, store, engine, unlockAudio } = usePlayer();
  const { state: room, clockOffset, send } = useRoom(ROOM_ID);

  const [songsById, setSongsById] = useState<Map<string, SongMeta>>(new Map());
  const [lyricState, setLyricState] = useState<{ id: string | null; lines: LyricLine[] }>({
    id: null,
    lines: [],
  });
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [controlsUntil, setControlsUntil] = useState(0);

  const pendingRef = useRef<string | null>(null);
  const endedIdRef = useRef<string | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const posRef = useRef(0);
  const lastSeekRef = useRef<number | null>(null);
  const countdownFiredRef = useRef<number | null>(null);
  const roomRef = useRef(room);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // TV-remote D-pad navigation across every [data-focusable] element.
  useSpatialNav();

  // Unlock the AudioContext on the first user gesture (remote OK / click).
  useEffect(() => {
    const once = () => unlockAudio();
    window.addEventListener("pointerdown", once, { once: true });
    window.addEventListener("keydown", once, { once: true });
    return () => {
      window.removeEventListener("pointerdown", once);
      window.removeEventListener("keydown", once);
    };
  }, [unlockAudio]);

  // A selection parked while the engine was still booting is replayed here.
  useEffect(() => {
    if (!engine || !pendingRef.current) return;
    const id = pendingRef.current;
    pendingRef.current = null;
    store.playSong(id);
  }, [engine, store]);

  // --- Room → playback mirror -------------------------------------------
  useEffect(() => {
    if (!room) return;
    const { currentId: rid, phase, isPlaying: wantPlaying } = room;

    if (phase === "idle" || !rid) {
      if (player.currentId) store.stop();
      return;
    }
    if (phase === "countdown") {
      if (player.isPlaying) store.pause();
      return;
    }
    // phase === "playing"
    if (player.currentId !== rid) {
      unlockAudio();
      if (engine) store.playSong(rid);
      else pendingRef.current = rid;
      return;
    }
    if (wantPlaying && !player.isPlaying) {
      // A natural song end leaves the room momentarily "playing"; do not resume.
      if (endedIdRef.current === player.currentId) return;
      unlockAudio();
      engine?.play();
    } else if (!wantPlaying && player.isPlaying) {
      store.pause();
    }
  }, [room, player.currentId, player.isPlaying, engine, store, unlockAudio]);

  useEffect(() => {
    endedIdRef.current = null;
  }, [room?.currentId]);

  // --- Server-authoritative countdown → start playback at zero -----------
  useEffect(() => {
    if (!room || room.phase !== "countdown" || room.countdownEndsAt === null) return;
    const endsAt = room.countdownEndsAt;
    if (countdownFiredRef.current === endsAt) return;
    const tick = () => {
      if (Date.now() + clockOffset >= endsAt) {
        countdownFiredRef.current = endsAt;
        unlockAudio();
        void send({ kind: "beginPlayback" });
      }
    };
    const timer = window.setInterval(tick, 150);
    tick();
    return () => window.clearInterval(timer);
  }, [room, clockOffset, send, unlockAudio]);

  // --- Seek sync (only on an explicit seek, never on our own progress) ---
  useEffect(() => {
    if (!room) return;
    if (lastSeekRef.current === null) {
      lastSeekRef.current = room.seekNonce;
      return;
    }
    if (room.seekNonce !== lastSeekRef.current) {
      lastSeekRef.current = room.seekNonce;
      store.seek(room.positionSec);
    }
  }, [room, store]);

  // --- Volume sync --------------------------------------------------------
  useEffect(() => {
    const volume = room?.volume;
    if (engine && volume !== undefined) engine.setVolume(volume);
  }, [engine, room?.volume]);

  // --- Report our position so controllers can show progress --------------
  useEffect(() => {
    posRef.current = player.positionSec;
    playerIdRef.current = player.currentId;
  }, [player.positionSec, player.currentId]);
  useEffect(() => {
    if (!player.isPlaying) return;
    const timer = window.setInterval(() => {
      void send({ kind: "progress", positionSec: posRef.current });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [player.isPlaying, send]);

  // --- Natural song end → advance (with countdown) or stop ---------------
  useEffect(() => {
    if (player.songEndCount === 0) return;
    endedIdRef.current = playerIdRef.current;
    const queue = roomRef.current?.queue ?? [];
    if (queue.length > 0) void send({ kind: "next", countdownSec: COUNTDOWN_SECONDS });
    else void send({ kind: "stop" });
  }, [player.songEndCount, send]);

  // --- Lyrics for the current song ---------------------------------------
  useEffect(() => {
    const id = room?.currentId ?? null;
    // No song on stage: the derived `lines` below is already empty because
    // lyricState.id no longer matches, so there is nothing to reset here.
    if (!id) return;
    let cancelled = false;
    void loadLyricLines(id).then((lines) => {
      if (!cancelled) setLyricState({ id, lines });
    });
    return () => {
      cancelled = true;
    };
  }, [room?.currentId]);

  // --- Resolve queue / current song ids to metadata -----------------------
  useEffect(() => {
    const wanted = new Set<string>();
    if (room?.currentId) wanted.add(room.currentId);
    for (const entry of room?.queue ?? []) wanted.add(entry.songId);
    const missing = Array.from(wanted).filter((id) => !songsById.has(id));
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

  // Countdown display ticker.
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  // Reveal the control bar on any key/click, then auto-hide it.
  const revealControls = useCallback(() => {
    setControlsUntil(Date.now() + 6000);
  }, []);
  useEffect(() => {
    const onActivity = () => revealControls();
    window.addEventListener("keydown", onActivity);
    window.addEventListener("pointerdown", onActivity);
    return () => {
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("pointerdown", onActivity);
    };
  }, [revealControls]);

  const secondsLeft =
    room?.countdownEndsAt != null
      ? Math.max(0, Math.ceil((room.countdownEndsAt - (nowTick + clockOffset)) / 1000))
      : 0;

  const currentSong = room?.currentId ? songsById.get(room.currentId) : undefined;
  const currentTitle = currentSong?.title ?? "";
  const currentArtist = currentSong?.artist ?? "";
  const lines = lyricState.id === room?.currentId ? lyricState.lines : [];
  const effectiveTime = player.positionSec + (room?.lyricOffsetSec ?? 0);

  const queueEntries = (room?.queue ?? []).map((entry) => ({
    ...entry,
    song: songsById.get(entry.songId),
  }));
  const queuedIds = useMemo(() => new Set((room?.queue ?? []).map((e) => e.songId)), [room?.queue]);

  const addSong = useCallback(
    async (song: SongMeta) => {
      if (queuedIds.has(song.id)) {
        setFeedback("Already in queue");
        return "duplicate" as const;
      }
      setSongsById((prev) => new Map(prev).set(song.id, song));
      const next = await send({ kind: "enqueue", songId: song.id });
      if (!next) {
        setFeedback("Song not found");
        return "error" as const;
      }
      setFeedback("Song added to queue");
      return "added" as const;
    },
    [queuedIds, send],
  );

  const playNow = useCallback(
    (song: SongMeta) => {
      setSongsById((prev) => new Map(prev).set(song.id, song));
      unlockAudio();
      void send({ kind: "play", songId: song.id, countdownSec: COUNTDOWN_SECONDS });
      setOverlay("none");
      setFeedback("Now playing");
    },
    [send, unlockAudio],
  );

  const submitNumber = useCallback(async () => {
    const q = number.trim();
    if (!q) return;
    const page = await searchSongs(q, 10, 0);
    const exact =
      page.items.find((s) => s.number === q) ??
      page.items.find((s) => s.number && s.number.replace(/^0+/, "") === q.replace(/^0+/, ""));
    const song = exact ?? page.items[0];
    if (!song) {
      setFeedback("Song not found");
      return;
    }
    await addSong(song);
    setNumber("");
  }, [number, addSong]);

  const toggleFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }, []);

  // Back/Escape closes overlays without leaving the karaoke screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && overlay !== "none") {
        e.preventDefault();
        setOverlay("none");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay]);

  const showCountdown = room?.phase === "countdown";
  const controlsVisible = overlay === "none" && (!player.isPlaying || nowTick < controlsUntil);

  return (
    <main
      ref={containerRef}
      data-testid="tv-display"
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#05060a",
        color: "#fff",
      }}
    >
      <BackgroundMedia />
      {/* Readability gradient behind the lyrics. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 30%, rgba(0,0,0,0.18) 55%, rgba(0,0,0,0.82) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // Safe margins so nothing is cut off across TV overscan/sizes.
          padding: "3.4vh max(4vw, 3.4vh)",
        }}
      >
        {/* --- Top overlay: now singing + up next + room code --- */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "3vw" }}>
          <div style={{ minWidth: 0 }}>
            {room?.currentId ? (
              <>
                <p style={{ margin: 0, fontSize: "2.4vh", letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.7 }}>
                  Now Singing
                </p>
                <h1
                  style={{
                    margin: "0.4vh 0 0",
                    fontSize: "4.4vh",
                    fontWeight: 900,
                    lineHeight: 1.1,
                    textShadow: "0 0.3vh 1.2vh rgba(0,0,0,0.85)",
                  }}
                >
                  {room.currentSinger ? `${room.currentSinger} — ` : ""}
                  {songLabel({ title: currentTitle, artist: currentArtist })}
                </h1>
              </>
            ) : (
              <h1 style={{ margin: 0, fontSize: "3.6vh", fontWeight: 800, opacity: 0.85 }}>
                {branding.name} — ready when you are
              </h1>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: "2vw", flex: "none" }}>
            {queueEntries.length > 0 && (
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: 0, fontSize: "2vh", letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.65 }}>
                  Up Next
                </p>
                {queueEntries.slice(0, 2).map((e, i) => (
                  <p key={`${e.songId}-${i}`} style={{ margin: "0.4vh 0 0", fontSize: "2.4vh", fontWeight: 700 }}>
                    {e.singer ? `${e.singer} — ` : ""}
                    {e.song ? e.song.title : "…"}
                  </p>
                ))}
              </div>
            )}
            <div style={{ textAlign: "right", opacity: 0.9 }}>
              <QrPanel url={controllerUrl} />
              <p style={{ margin: "0.6vh 0 0", fontSize: "1.8vh", opacity: 0.7 }}>Room {ROOM_CODE}</p>
            </div>
          </div>
        </header>

        {/* --- Lyrics / countdown stage --- */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2vh 0",
          }}
        >
          {showCountdown ? (
            <CountdownScreen
              secondsLeft={secondsLeft}
              singer={room?.currentSinger ?? ""}
              title={currentTitle}
              artist={currentArtist}
            />
          ) : (
            <TvLyrics lines={lines} timeSec={effectiveTime} />
          )}
        </div>

        {/* --- Bottom: queue strip + controls --- */}
        <footer style={{ display: "flex", flexDirection: "column", gap: "1.6vh" }}>
          {controlsVisible && (
            <div
              data-testid="tv-controls"
              style={{
                display: "flex",
                gap: "1.2vw",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.55)",
                borderRadius: "1.4vh",
                padding: "1.2vh 1.6vw",
                backdropFilter: "blur(6px)",
              }}
            >
              <ControlButton
                label="Song number"
                onClick={() => setOverlay("number")}
                icon={<MusicIcon size="2.6vh" />}
              />
              <ControlButton label="Search" onClick={() => setOverlay("songbook")} icon={<SearchIcon size="2.6vh" />} />
              <ControlButton label="Queue" onClick={() => setOverlay("queue")} icon={<BookIcon size="2.6vh" />} />
              <ControlButton
                label={player.isPlaying ? "Pause" : "Play"}
                onClick={() => {
                  unlockAudio();
                  void send({ kind: player.isPlaying ? "pause" : "resume" });
                }}
                icon={player.isPlaying ? <PauseIcon size="2.6vh" /> : <PlayIcon size="2.6vh" />}
              />
              <ControlButton label="Restart" onClick={() => void send({ kind: "restart" })} icon={<PrevIcon size="2.6vh" />} />
              <ControlButton
                label="Next"
                onClick={() => void send({ kind: "next", countdownSec: COUNTDOWN_SECONDS })}
                icon={<NextIcon size="2.6vh" />}
              />
              <ControlButton label="Stop" onClick={() => void send({ kind: "stop" })} icon={<StopIcon size="2.6vh" />} />
              <ControlButton
                label="Lyrics −"
                onClick={() => void send({ kind: "setLyricOffset", offsetSec: (room?.lyricOffsetSec ?? 0) - 0.5 })}
                icon={<FlatIcon size="2.6vh" />}
              />
              <ControlButton
                label="Lyrics +"
                onClick={() => void send({ kind: "setLyricOffset", offsetSec: (room?.lyricOffsetSec ?? 0) + 0.5 })}
                icon={<SharpIcon size="2.6vh" />}
              />
              <ControlButton label="Fullscreen" onClick={toggleFullscreen} icon={<span style={{ fontSize: "2.6vh" }}>⛶</span>} />
            </div>
          )}

          {queueEntries.length > 0 && (
            <div
              data-testid="tv-queue-strip"
              style={{
                display: "flex",
                gap: "2vw",
                justifyContent: "center",
                flexWrap: "wrap",
                fontSize: "2.2vh",
                opacity: player.isPlaying ? 0.75 : 0.95,
              }}
            >
              {queueEntries.slice(0, 3).map((e, i) => (
                <span key={`${e.songId}-${i}`} style={{ whiteSpace: "nowrap" }}>
                  <b style={{ color: "#93c5fd" }}>{i + 1}.</b>{" "}
                  {e.singer ? `${e.singer} — ` : ""}
                  {e.song ? e.song.title : "…"}
                  {i < Math.min(queueEntries.length, 3) - 1 ? " •" : ""}
                </span>
              ))}
            </div>
          )}
        </footer>
      </div>

      {/* --- Overlays --- */}
      {overlay === "songbook" && (
        <Songbook
          queuedIds={queuedIds}
          onAdd={addSong}
          onPlayNow={playNow}
          onClose={() => setOverlay("none")}
          feedback={feedback}
        />
      )}

      {overlay === "number" && (
        <OverlayShell title="Enter song number" onClose={() => setOverlay("none")}>
          <NumberPad value={number} onChange={setNumber} onSubmit={() => void submitNumber()} feedback={feedback} />
        </OverlayShell>
      )}

      {overlay === "queue" && (
        <OverlayShell title={`Queue (${queueEntries.length})`} onClose={() => setOverlay("none")}>
          {queueEntries.length === 0 ? (
            <p style={{ fontSize: "3vh", opacity: 0.7 }}>The queue is empty.</p>
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "1.4vh", fontSize: "3vh" }}>
              {queueEntries.map((e, i) => (
                <li key={`${e.songId}-${i}`} style={{ display: "flex", gap: "2ch", alignItems: "baseline" }}>
                  <span style={{ opacity: 0.6, minWidth: "3ch", textAlign: "right" }}>{i + 1}</span>
                  <span style={{ flex: 1 }}>
                    {e.song ? songLabel(e.song) : e.songId}
                    {e.singer ? <span style={{ opacity: 0.7 }}> · {e.singer}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </OverlayShell>
      )}
    </main>
  );
}

function ControlButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-focusable="true"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.8ch",
        fontSize: "2.2vh",
        fontWeight: 700,
        padding: "1.2vh 2.2vh",
        borderRadius: "1vh",
        border: "0.2vh solid rgba(255,255,255,0.22)",
        background: "rgba(255,255,255,0.1)",
        color: "#fff",
        cursor: "pointer",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function OverlayShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        background: "rgba(6,8,16,0.94)",
        color: "#fff",
        padding: "3vh 4vw",
        gap: "2.4vh",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: "3.4vh", fontWeight: 800 }}>{title}</h2>
        <button type="button" data-focusable="true" onClick={onClose} aria-label="Close" style={closeBtn}>
          <CloseIcon size="2.8vh" />
        </button>
      </header>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

const closeBtn: CSSProperties = {
  fontSize: "2.6vh",
  padding: "1vh 1.6vh",
  borderRadius: "1vh",
  border: "0.2vh solid rgba(255,255,255,0.22)",
  background: "rgba(255,255,255,0.1)",
  color: "#fff",
  cursor: "pointer",
};

export default TvDisplay;
