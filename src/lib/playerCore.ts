// Framework-agnostic player core: pure state store plus the engine contract.
// This module must stay free of any browser/Web Audio imports so it can be
// unit-tested under vitest with `environment: "node"`. The real engine
// (src/lib/spessaEngine.ts) is only ever imported lazily in the browser.

export type PlayerEvent = "lyric" | "time" | "songEnd" | "state";

export interface PlayerEngine {
  ready(): Promise<void>;
  /**
   * When false, the store hands the engine the song id instead of fetching the
   * raw MIDI bytes (used by engines that stream a file the server prepared).
   * Defaults to true.
   */
  readonly wantsBytes?: boolean;
  loadSong(source: ArrayBuffer | string, fileName: string): Promise<void>;
  play(): void;
  pause(): void;
  stop(): void;
  seek(sec: number): void;
  setVolume(v: number): void;
  setTempo(r: number): void;
  setTranspose(semis: number): void;
  muteChannel(ch: number, muted: boolean): void;
  currentTime(): number;
  /**
   * True while the audio context is actually running. Browsers keep it
   * suspended until a user gesture, and a TV can suspend it later; the UI uses
   * this to tell the user to press a key instead of showing frozen lyrics.
   */
  isRunning(): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- interface mandated by spec
  on(evt: PlayerEvent, cb: (p?: any) => void): void;
}

export interface PlayerState {
  audioUnlocked: boolean;
  currentId: string | null;
  isPlaying: boolean;
  positionSec: number;
  currentLyric: string | null;
  /** Monotonic count of engine `songEnd` events (natural song ends). Lets
   *  the UI distinguish "song finished" from a user pause/stop and drive
   *  the auto-advance countdown. */
  songEndCount: number;
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
  currentLyric: null,
  songEndCount: 0,
};

export function createPlayerStore(engine?: PlayerEngine): PlayerStore {
  let state: PlayerState = { ...initialState };
  let currentEngine: PlayerEngine | undefined = engine;
  // Monotonic token guarding the async song load: any transport action
  // (playSong/pause/stop) invalidates in-flight loads from earlier actions.
  let playToken = 0;
  const listeners: Array<(s: PlayerState) => void> = [];

  function emit() {
    for (const cb of listeners) cb(state);
  }

  function wireEngine(e: PlayerEngine) {
    // Bridge engine events back into the store.
    e.on("lyric", (p?: unknown) => {
      const text =
        typeof p === "string"
          ? p
          : typeof p === "object" && p !== null && "text" in p
            ? (p as { text: unknown }).text
            : undefined;
      if (typeof text === "string" && text) {
        state = { ...state, currentLyric: text };
        emit();
      }
    });
    e.on("time", (t?: number) => {
      if (typeof t === "number" && state.isPlaying) {
        state = { ...state, positionSec: t };
        emit();
      }
    });
    e.on("songEnd", () => {
      // Keep currentId: the auto-advance countdown needs to know which song
      // just ended (its queue position is already gone — it was removed
      // when playback started).
      state = {
        ...state,
        isPlaying: false,
        positionSec: 0,
        currentLyric: null,
        songEndCount: state.songEndCount + 1,
      };
      emit();
    });
    e.on("state", (p?: unknown) => {
      if (
        typeof p === "object" &&
        p !== null &&
        "isPlaying" in p &&
        typeof (p as { isPlaying: unknown }).isPlaying === "boolean" &&
        (p as { isPlaying: boolean }).isPlaying !== state.isPlaying
      ) {
        state = { ...state, isPlaying: (p as { isPlaying: boolean }).isPlaying };
        emit();
      }
    });
  }

  async function loadAndPlay(engine: PlayerEngine, id: string, token: number) {
    // Engines that stream a prepared file only need the id; every other engine
    // gets the raw MIDI bytes.
    let source: ArrayBuffer | string = id;
    if (engine.wantsBytes !== false) {
      const res = await fetch(`/api/songs/${encodeURIComponent(id)}/file`);
      if (!res.ok) throw new Error(`failed to fetch song ${id}: ${res.status}`);
      source = await res.arrayBuffer();
      // Check the token BEFORE handing the bytes to the engine: a superseded load
      // must never replace the song a newer play() already put on the synth.
      if (token !== playToken) return;
    }
    await engine.loadSong(source, `${id}.mid`);
    // Bail if a newer playSong/pause/stop superseded this request while loading.
    if (token !== playToken) return;
    engine.play();
  }

  function startLoad(engine: PlayerEngine, id: string, token: number) {
    void loadAndPlay(engine, id, token).catch((err: unknown) => {
      // A stale failure must not clobber state for a newer request.
      if (token !== playToken) return;
      console.error("playSong failed:", err);
      state = { ...state, isPlaying: false };
      emit();
    });
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
      playToken += 1;
      const token = playToken;
      state = { ...state, currentId: id, isPlaying: true, positionSec: 0, currentLyric: null };
      emit();
      if (currentEngine) startLoad(currentEngine, id, token);
      return true;
    },

    pause() {
      if (!state.isPlaying) return;
      playToken += 1; // a pending load must not start playback after a pause
      state = { ...state, isPlaying: false };
      emit();
      currentEngine?.pause();
    },

    stop() {
      playToken += 1;
      state = { ...state, isPlaying: false, positionSec: 0, currentId: null, currentLyric: null };
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
