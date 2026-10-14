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

  useEffect(() => {
    // Bridge store changes (incl. engine lyric/time/songEnd events) into React state.
    return store.subscribe(setState);
  }, [store]);

  const unlockAudio = useCallback(() => {
    store.unlockAudio();
    if (engineRef.current) {
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
