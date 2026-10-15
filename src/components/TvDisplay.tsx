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
import { resolveSongs, searchSongs, findByNumber, songLabel } from "@/lib/songsClient";
import { useSpatialNav } from "@/lib/useSpatialNav";
import { useReloadOnDemand } from "@/lib/useReloadOnDemand";
import type { SongMeta } from "@/lib/scanner";
import type { LyricLine } from "@/lib/lyrics";
import type { PlayerEngine } from "@/lib/playerCore";
import { BackgroundMedia } from "@/components/BackgroundMedia";
import { TvLyrics } from "@/components/TvLyrics";
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
  FullscreenIcon,
} from "@/components/Icons";

type Overlay = "none" | "songbook" | "number" | "queue";

// Animation delays / durations for the idle equalizer bars (a little bounce).
const EQ_BARS = [0, 0.35, 0.7, 0.15, 0.55, 0.9, 0.25, 0.65, 0.45];

// How long the post-song score/celebration holds the stage before the next
// song may start. Long enough to read the score and add another song.
const SCORE_SECONDS = 8;

export function TvDisplay({ controllerUrl }: { controllerUrl: string }) {
  const { state: player, store, engine, unlockAudio, audioError } = usePlayer();
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

  const feedbackTimer = useRef<number | null>(null);
  const showFeedback = useCallback((msg: string | null) => {
    setFeedback(msg);
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = msg ? window.setTimeout(() => setFeedback(null), 3500) : null;
  }, []);

  const pendingRef = useRef<string | null>(null);
  // Timestamp of the last natural song end: the room stays "playing" for a
  // moment while the next/stop command is in flight, so the resume below is
  // suppressed only briefly (never permanently).
  const endedAtRef = useRef<number | null>(null);
  const posRef = useRef(0);
  const lastSeekRef = useRef<number | null>(null);
  const countdownFiredRef = useRef<number | null>(null);
  const scoreFiredRef = useRef<number | null>(null);
  const roomRef = useRef(room);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // TV-remote D-pad navigation across every [data-focusable] element.
  useSpatialNav();

  // A "refresh all" from the controller reloads this screen too.
  useReloadOnDemand(room?.reloadNonce);

  // Audio unlock is owned by PlayerProvider: it listens for any gesture for the
  // whole session, so a hard refresh (which resets the gesture state) only needs
  // one key press instead of silently never starting the sound.

  // Refreshing or closing the TV page means the player is gone, so tell the
  // room to stop: every device returns to the idle state instead of the song
  // resuming from the top on the next load.
  useEffect(() => {
    const stopNow = () => {
      try {
        const body = JSON.stringify({ kind: "stop" });
        navigator.sendBeacon?.(
          `/api/remote/${encodeURIComponent(ROOM_ID)}/command`,
          new Blob([body], { type: "application/json" }),
        );
      } catch {
        // Best effort; a missed beacon just leaves the room as it was.
      }
    };
    window.addEventListener("pagehide", stopNow);
    window.addEventListener("beforeunload", stopNow);
    return () => {
      window.removeEventListener("pagehide", stopNow);
      window.removeEventListener("beforeunload", stopNow);
    };
  }, []);

  // A selection parked while the engine was still booting is replayed here.
  useEffect(() => {
    if (!engine || !pendingRef.current) return;
    const id = pendingRef.current;
    pendingRef.current = null;
    store.playSong(id);
  }, [engine, store]);

  // --- Natural song end → hold the stage for the score ---------------
  // Declared BEFORE the room→playback mirror on purpose: effects run in
  // declaration order, and the mirror reads endedAtRef to tell "the song ended
  // and the score is on its way" from "the room wants playback we are not
  // doing". With the mirror first, it would see endedAtRef still null and
  // restart the song it just finished.
  useEffect(() => {
    if (player.songEndCount === 0) return;
    endedAtRef.current = Date.now();
    // Show the fun score for a beat; the queue is re-checked when that beat
    // ends, so songs added in the meantime still play.
    void send({ kind: "beginScore", seconds: SCORE_SECONDS });
  }, [player.songEndCount, send]);

  // --- Room → playback mirror -------------------------------------------
  useEffect(() => {
    if (!room) return;
    const { currentId: rid, phase, isPlaying: wantPlaying } = room;

    if (phase === "idle" || !rid) {
      if (player.currentId) store.stop();
      return;
    }
    if (phase === "countdown" || phase === "score") {
      if (player.isPlaying) store.pause();
      return;
    }
    // phase === "playing"
    if (player.currentId !== rid) {
      unlockAudio();
      if (engine) {
        pendingRef.current = null; // a direct play supersedes any parked selection
        store.playSong(rid);
      } else {
        pendingRef.current = rid;
      }
      return;
    }
    if (wantPlaying && !player.isPlaying) {
      // A song that just ended leaves the room "playing" for a moment while the
      // next/stop command is in flight. Suppress the resume only for that short
      // window, then recover so the TV can never get stuck showing "paused"
      // while the room says it is playing.
      const endedAt = endedAtRef.current;
      if (endedAt !== null && Date.now() - endedAt < 2000) return;
      unlockAudio();
      if (!engine) {
        pendingRef.current = rid;
      } else if (!store.resume(rid)) {
        // The engine holds nothing for this id (a fresh selection, or a load
        // that failed): load it. A pause/resume of the song already on the
        // synth takes the branch above and keeps playing where it stopped.
        store.playSong(rid);
      }
    } else if (!wantPlaying && player.isPlaying) {
      store.pause();
    }
  }, [room, player.currentId, player.isPlaying, engine, store, unlockAudio]);

  useEffect(() => {
    endedAtRef.current = null;
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
  }, [player.positionSec]);
  useEffect(() => {
    if (!player.isPlaying) return;
    const timer = window.setInterval(() => {
      void send({ kind: "progress", positionSec: posRef.current });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [player.isPlaying, send]);

  // --- Score deadline → advance if anything is queued, else stop ----------
  useEffect(() => {
    if (!room || room.phase !== "score" || room.scoreEndsAt === null) return;
    const endsAt = room.scoreEndsAt;
    if (scoreFiredRef.current === endsAt) return;
    const tick = () => {
      if (Date.now() + clockOffset >= endsAt) {
        scoreFiredRef.current = endsAt;
        const queue = roomRef.current?.queue ?? [];
        if (queue.length > 0) void send({ kind: "next" });
        else void send({ kind: "stop" });
      }
    };
    const timer = window.setInterval(tick, 150);
    tick();
    return () => window.clearInterval(timer);
  }, [room, clockOffset, send]);

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

  const currentSong = room?.currentId ? songsById.get(room.currentId) : undefined;
  const currentTitle = currentSong?.title ?? "";
  const currentArtist = currentSong?.artist ?? "";
  const lines = lyricState.id === room?.currentId ? lyricState.lines : [];

  const queueEntries = (room?.queue ?? []).map((entry) => ({
    ...entry,
    song: songsById.get(entry.songId),
  }));
  const queuedIds = useMemo(() => new Set((room?.queue ?? []).map((e) => e.songId)), [room?.queue]);

  const addSong = useCallback(
    async (song: SongMeta) => {
      if (queuedIds.has(song.id)) {
        showFeedback("Already in queue");
        return "duplicate" as const;
      }
      setSongsById((prev) => new Map(prev).set(song.id, song));
      const next = await send({ kind: "enqueue", songId: song.id });
      if (!next) {
        showFeedback("Song not found");
        return "error" as const;
      }
      showFeedback(`Added “${song.title}” to the queue`);
      return "added" as const;
    },
    [queuedIds, send, showFeedback],
  );

  const playNow = useCallback(
    (song: SongMeta) => {
      setSongsById((prev) => new Map(prev).set(song.id, song));
      unlockAudio();
      void send({ kind: "play", songId: song.id });
      setOverlay("none");
      showFeedback("Now playing");
    },
    [send, unlockAudio, showFeedback],
  );

  const submitNumber = useCallback(async () => {
    const q = number.trim();
    if (!q) return;
    const song = (await findByNumber(q)) ?? (await searchSongs(q, 10, 0)).items[0] ?? null;
    if (!song) {
      showFeedback("Song not found");
      return;
    }
    const result = await addSong(song);
    if (result === "added") setNumber("");
    // Auto-close the keypad once a song is in (feedback shows on the stage).
    setOverlay("none");
  }, [number, addSong, showFeedback]);

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

  const controlsVisible = overlay === "none" && (!player.isPlaying || nowTick < controlsUntil);
  // A song is on stage but the TV cannot make sound yet. Browsers keep the
  // audio context suspended until a gesture (and a TV can suspend it later), so
  // the engine clock is frozen and the lyrics/countdown would sit still. Tell
  // the user to press a key — one press resumes the context and the song starts.
  // Before the engine exists, the store's unlock flag is the only signal.
  const audioRunning = engine ? engine.isRunning() : player.audioUnlocked;
  const needsGesture = !!room?.currentId && !audioRunning;
  const scoreSecondsLeft =
    room?.scoreEndsAt != null
      ? Math.max(0, Math.ceil((room.scoreEndsAt - (nowTick + clockOffset)) / 1000))
      : 0;

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
            "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.06) 26%, rgba(0,0,0,0.06) 58%, rgba(0,0,0,0.7) 100%)",
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
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "3vw", flexWrap: "wrap" }}>
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
            ) : null}
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
          {!room?.currentId ? (
            <div data-testid="tv-idle" className="kh-splash">
              <h1 className="kh-logo">{branding.name}</h1>
              <p className="kh-byline">{branding.byline}</p>
              <div className="kh-eq" aria-hidden="true">
                {EQ_BARS.map((delay, i) => (
                  <span
                    key={i}
                    style={{ animationDelay: `${delay}s`, animationDuration: `${1.1 + (i % 3) * 0.18}s` }}
                  />
                ))}
              </div>
              <p className="kh-hint">Scan the QR code or open the controller to add a song</p>
            </div>
          ) : room.phase === "score" && room.score ? (
            <TvScore
              score={room.score}
              singer={room.currentSinger}
              title={currentTitle}
              artist={currentArtist}
              secondsLeft={scoreSecondsLeft}
              hasNext={room.queue.length > 0}
            />
          ) : (
            <LiveLyrics
              engine={engine}
              isPlaying={player.isPlaying}
              fallbackTime={player.positionSec}
              offsetSec={room?.lyricOffsetSec ?? 0}
              lines={lines}
            />
          )}
        </div>

        {/* --- Bottom: queue strip + controls --- */}
        <footer style={{ display: "flex", flexDirection: "column", gap: "1.6vh" }}>
          {audioError ? (
            <p
              role="alert"
              data-testid="tv-audio-error"
              style={{
                margin: 0,
                alignSelf: "center",
                maxWidth: "80vw",
                fontSize: "2.2vh",
                fontWeight: 700,
                color: "#fca5a5",
                background: "rgba(0,0,0,0.78)",
                padding: "1.4vh 2.4vh",
                borderRadius: "1vh",
                textAlign: "center",
                lineHeight: 1.35,
              }}
            >
              {audioError}
            </p>
          ) : needsGesture ? (
            <p
              role="status"
              data-testid="tv-needs-gesture"
              style={{
                margin: 0,
                alignSelf: "center",
                fontSize: "2.6vh",
                fontWeight: 700,
                color: "#fde047",
                background: "rgba(0,0,0,0.72)",
                padding: "1.2vh 2.4vh",
                borderRadius: "1vh",
                textAlign: "center",
              }}
            >
              Press OK on the remote (or tap the screen) to start the sound
            </p>
          ) : null}
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
                onClick={() => void send({ kind: "next" })}
                icon={<NextIcon size="2.6vh" />}
              />
              <ControlButton label="Stop" onClick={() => void send({ kind: "stop" })} icon={<StopIcon size="2.6vh" />} />
              <ControlButton label="Fullscreen" onClick={toggleFullscreen} icon={<FullscreenIcon size="2.6vh" />} />
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
      {feedback && overlay === "none" && (
        <p
          role="status"
          data-testid="tv-toast"
          style={{
            position: "fixed",
            bottom: "12vh",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            margin: 0,
            fontSize: "2.6vh",
            background: "rgba(0,0,0,0.78)",
            padding: "1.2vh 2.4vh",
            borderRadius: "1vh",
          }}
        >
          {feedback}
        </p>
      )}

      {overlay === "songbook" && (
        <Songbook
          queuedIds={queuedIds}
          onAdd={addSong}
          onPlayNow={playNow}
          onClose={() => setOverlay("none")}
          performing={room?.phase === "countdown" || !!room?.isPlaying}
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

// Post-song celebration: the cosmetic fun score plus the beat before the next
// song. Deliberately labeled as fun-only — Kantahub never captures audio.
function TvScore({
  score,
  singer,
  title,
  artist,
  secondsLeft,
  hasNext,
}: {
  score: { value: number; reaction: string };
  singer: string;
  title: string;
  artist: string;
  secondsLeft: number;
  hasNext: boolean;
}) {
  return (
    <div
      data-testid="tv-score"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1.4vh",
        textAlign: "center",
        width: "100%",
      }}
    >
      <p style={{ margin: 0, fontSize: "2.6vh", letterSpacing: "0.3em", textTransform: "uppercase", opacity: 0.7 }}>
        Score
      </p>
      <p
        style={{
          margin: 0,
          fontSize: "clamp(9vh, 18vw, 26vh)",
          fontWeight: 900,
          lineHeight: 1,
          color: "#fbbf24",
          textShadow: "0 0.6vh 3vh rgba(0,0,0,0.85)",
        }}
      >
        {score.value}
      </p>
      <p style={{ margin: 0, fontSize: "clamp(3vh, 5vw, 6.5vh)", fontWeight: 800 }}>{score.reaction}</p>
      <p style={{ margin: 0, fontSize: "2.6vh", opacity: 0.85 }}>
        {singer ? `${singer} — ` : ""}
        {songLabel({ title, artist })}
      </p>
      <p data-testid="tv-score-next" style={{ margin: 0, fontSize: "2.6vh", opacity: 0.75 }}>
        {hasNext ? `Next song in ${secondsLeft}…` : "That was the last song in the queue"}
      </p>
      <p style={{ margin: 0, fontSize: "1.6vh", opacity: 0.4 }}>
        For fun only — Kantahub never listens to your microphone.
      </p>
    </div>
  );
}

// Lyrics are driven by the engine's own clock on requestAnimationFrame (~30 fps)
// rather than the store's throttled 10 fps position, so the highlight tracks the
// music with minimal lag and no stutter. Only this small subtree re-renders per
// frame, not the whole display.
function LiveLyrics({
  engine,
  isPlaying,
  fallbackTime,
  offsetSec,
  lines,
}: {
  engine: PlayerEngine | null;
  isPlaying: boolean;
  fallbackTime: number;
  offsetSec: number;
  lines: LyricLine[];
}) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!engine || !isPlaying) return;
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last >= 33) {
        last = ts;
        setT(engine.currentTime());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, isPlaying]);
  const time = engine && isPlaying ? t : fallbackTime;
  return <TvLyrics lines={lines} timeSec={time + offsetSec} />;
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
