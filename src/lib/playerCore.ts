// Framework-agnostic player core: pure state store plus the engine contract.
// This module must stay free of any browser/Web Audio imports so it can be
// unit-tested under vitest with `environment: "node"`. The real engine
// (src/lib/spessaEngine.ts) is only ever imported lazily in the browser.

export type PlayerEvent = "lyric" | "time" | "songEnd" | "state";

export interface PlayerEngine {
  ready(): Promise<void>;
  loadSong(buf: ArrayBuffer, fileName: string): Promise<void>;
  play(): void;
  pause(): void;
  stop(): void;
  seek(sec: number): void;
  setVolume(v: number): void;
  setTempo(r: number): void;
  setTranspose(semis: number): void;
  muteChannel(ch: number, muted: boolean): void;
  currentTime(): number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- interface mandated by spec
  on(evt: PlayerEvent, cb: (p?: any) => void): void;
}

export interface PlayerState {
  audioUnlocked: boolean;
  currentId: string | null;
  isPlaying: boolean;
  positionSec: number;
}

export interface PlayerStore {
  state(): PlayerState;
  unlockAudio(): void;
  playSong(id: string): boolean;
  pause(): void;
  stop(): void;
  seek(sec: number): void;
  subscribe(cb: (s: PlayerState) => void): () => void;
  attachEngine(engine: PlayerEngine): void;
}

const initialState: PlayerState = {
  audioUnlocked: false,
  currentId: null,
  isPlaying: false,
  positionSec: 0,
};

export function createPlayerStore(engine?: PlayerEngine): PlayerStore {
  let state: PlayerState = { ...initialState };
  let currentEngine: PlayerEngine | undefined = engine;
  const listeners: Array<(s: PlayerState) => void> = [];

  function emit() {
    for (const cb of listeners) cb(state);
  }

  function wireEngine(e: PlayerEngine) {
    // Bridge engine events back into the store.
    e.on("time", (t?: number) => {
      if (typeof t === "number" && state.isPlaying) {
        state = { ...state, positionSec: t };
        emit();
      }
    });
    e.on("songEnd", () => {
      state = { ...state, isPlaying: false, positionSec: 0 };
      emit();
    });
  }

  async function loadAndPlay(engine: PlayerEngine, id: string) {
    const res = await fetch(`/api/songs/${encodeURIComponent(id)}/file`);
    if (!res.ok) throw new Error(`failed to fetch song ${id}: ${res.status}`);
    const buf = await res.arrayBuffer();
    await engine.loadSong(buf, `${id}.mid`);
    engine.play();
  }

  if (currentEngine) wireEngine(currentEngine);

  return {
    state: () => state,

    unlockAudio() {
      // Called from a real user gesture (the provider resumes the context).
      if (state.audioUnlocked) return;
      state = { ...state, audioUnlocked: true };
      emit();
    },

    playSong(id: string) {
      if (!state.audioUnlocked) return false;
      state = { ...state, currentId: id, isPlaying: true, positionSec: 0 };
      emit();
      if (currentEngine) {
        void loadAndPlay(currentEngine, id).catch((err) => {
          console.error("playSong failed:", err);
          state = { ...state, isPlaying: false };
          emit();
        });
      }
      return true;
    },

    pause() {
      if (!state.isPlaying) return;
      state = { ...state, isPlaying: false };
      emit();
      currentEngine?.pause();
    },

    stop() {
      state = { ...state, isPlaying: false, positionSec: 0, currentId: null };
      emit();
      currentEngine?.stop();
    },

    seek(sec: number) {
      state = { ...state, positionSec: sec };
      emit();
      currentEngine?.seek(sec);
    },

    subscribe(cb: (s: PlayerState) => void) {
      listeners.push(cb);
      return () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    attachEngine(e: PlayerEngine) {
      currentEngine = e;
      wireEngine(e);
    },
  };
}
