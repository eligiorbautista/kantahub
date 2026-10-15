"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createPlayerStore,
  type PlayerEngine,
  type PlayerState,
  type PlayerStore,
} from "@/lib/playerCore";
import { releaseWakeLock, requestWakeLock } from "@/lib/wakeLock";

export interface PlayerContextValue {
  state: PlayerState;
  store: PlayerStore;
  engine: PlayerEngine | null;
  /** Call from a real user gesture; resumes the AudioContext and boots the synth. */
  unlockAudio(): void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  // The store itself is pure JS; the store therefore instantiates once without
  // touching any browser-only APIs.
  const [store] = useState<PlayerStore>(() => createPlayerStore());
  const engineRef = useRef<PlayerEngine | null>(null);
  const [engine, setEngine] = useState<PlayerEngine | null>(null);
  const [state, setState] = useState<PlayerState>(() => store.state());
  // Browsers only let an AudioContext run after a real user gesture. Building
  // the synth (or handing it a song) before that leaves the context suspended,
  // the worklet never reports ready, and playback silently never starts — so
  // the synth is only ever created from a gesture, and playback is parked until
  // then. `wantedRef` records that the room asked for sound.
  const gestureSeenRef = useRef(false);
  const wantedRef = useRef(false);

  const bootEngine = useCallback(() => {
    store.unlockAudio();
    if (engineRef.current) {
      // Already built: make sure a context the TV suspended (screensaver, input
      // change) comes back.
      void (engineRef.current as { resume?: () => Promise<void> }).resume?.();
      return;
    }
    // Lazy-import keeps SpessaSynth out of the initial page payload.
    void (async () => {
      const { SpessaEngine } = await import("@/lib/spessaEngine");
      if (engineRef.current) return;
      const e = new SpessaEngine();
      engineRef.current = e;
      store.attachEngine(e);
      setEngine(e);
      await e.resume(); // ctx.resume() — still inside the user gesture
      e.ready().catch((err) => console.error("synth init failed:", err));
    })();
  }, [store]);

  useEffect(() => {
    // Bridge store changes (incl. engine lyric/time/songEnd events) into React state.
    return store.subscribe(setState);
  }, [store]);

  // Any gesture (remote OK, arrow key, tap) unlocks audio. Kept attached for the
  // whole session rather than firing once: a TV browser can suspend the context
  // later, and the next key press has to bring the sound back.
  useEffect(() => {
    const onGesture = () => {
      gestureSeenRef.current = true;
      if (wantedRef.current) bootEngine();
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [bootEngine]);

  // Keep the TV awake while a song plays (Screen Wake Lock API): acquire on
  // play, release on pause/stop/unmount. No-ops silently where unsupported.
  useEffect(() => {
    if (!state.isPlaying) return;
    void requestWakeLock(navigator);
    // Browsers revoke the lock whenever the page is hidden (screensaver
    // overlays, input hops); take it back once we are visible mid-song.
    const onVisible = () => {
      if (document.visibilityState === "visible") void requestWakeLock(navigator);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void releaseWakeLock();
    };
  }, [state.isPlaying]);

  const unlockAudio = useCallback(() => {
    // Called from a real gesture *and* from room-driven effects. Only a gesture
    // may actually build the synth; without one we just remember that sound is
    // wanted, so the first press starts the parked song.
    wantedRef.current = true;
    if (gestureSeenRef.current) bootEngine();
  }, [bootEngine]);

  const value = useMemo<PlayerContextValue>(
    () => ({ state, store, engine, unlockAudio }),
    [state, store, engine, unlockAudio],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within a PlayerProvider");
  return ctx;
}
