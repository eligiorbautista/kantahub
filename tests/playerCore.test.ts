import { describe, it, expect, vi, afterEach } from "vitest";
import { createPlayerStore, type PlayerEngine } from "@/lib/playerCore";

describe("player store", () => {
  it("requires a user gesture before audio starts", () => {
    const store = createPlayerStore();
    expect(store.state().audioUnlocked).toBe(false);
    store.unlockAudio();               // simulates first play press
    expect(store.state().audioUnlocked).toBe(true);
  });
  it("tracks play/pause state", () => {
    const store = createPlayerStore();
    store.unlockAudio();
    store.playSong("id1"); expect(store.state().isPlaying).toBe(true);
    store.pause();         expect(store.state().isPlaying).toBe(false);
  });
});

describe("engine event bridging", () => {
  function mockEngine() {
    const cbs: Record<string, (p?: unknown) => void> = {};
    const engine: PlayerEngine = {
      ready: () => Promise.resolve(),
      loadSong: () => Promise.resolve(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      setTempo: vi.fn(),
      setTranspose: vi.fn(),
      muteChannel: vi.fn(),
      currentTime: () => 0,
      on: (evt, cb) => {
        cbs[evt] = cb;
      },
    };
    return { engine, cbs };
  }

  it("exposes engine lyric events in state", () => {
    const { engine, cbs } = mockEngine();
    const store = createPlayerStore(engine);
    expect(store.state().currentLyric).toBeNull();
    cbs.lyric!("lips of an angel");
    expect(store.state().currentLyric).toBe("lips of an angel");
  });

  it("clears the lyric when a new song starts", () => {
    const { engine, cbs } = mockEngine();
    const store = createPlayerStore(engine);
    cbs.lyric!("line one");
    store.unlockAudio();
    store.playSong("id1");
    expect(store.state().currentLyric).toBeNull();
  });

  it("relays engine state events into store state", () => {
    const { engine, cbs } = mockEngine();
    const store = createPlayerStore(engine);
    store.unlockAudio();
    store.playSong("id1");
    cbs.state!({ isPlaying: false });
    expect(store.state().isPlaying).toBe(false);
  });
});

describe("stale async guards", () => {
  afterEach(() => vi.unstubAllGlobals());

  function fetchStub() {
    const resolveA = { current: undefined as ((res: unknown) => void) | undefined };
    const resolveB = { current: undefined as ((res: unknown) => void) | undefined };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveA.current = r)))
      .mockImplementationOnce(() => new Promise((r) => (resolveB.current = r)));
    vi.stubGlobal("fetch", fetchMock);
    const ok = () => ({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    const flush = () => new Promise((r) => setTimeout(r, 0));
    return {
      resolveAFn: (res: unknown) => resolveA.current!(res),
      resolveBFn: (res: unknown) => resolveB.current!(res),
      ok,
      flush,
    };
  }

  function mockEngine() {
    return {
      ready: () => Promise.resolve(),
      loadSong: vi.fn(() => Promise.resolve()),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      setTempo: vi.fn(),
      setTranspose: vi.fn(),
      muteChannel: vi.fn(),
      currentTime: () => 0,
      on: vi.fn(),
    } as PlayerEngine & { play: ReturnType<typeof vi.fn> };
  }

  it("ignores a stale song load superseded by a newer playSong", async () => {
    const { resolveAFn, resolveBFn, ok, flush } = fetchStub();
    const engine = mockEngine();
    const store = createPlayerStore(engine);
    store.unlockAudio();
    store.playSong("a");
    store.playSong("b"); // supersedes a

    resolveAFn(ok()); // stale load finishes
    await flush();
    expect(engine.play).not.toHaveBeenCalled();

    resolveBFn(ok()); // current load finishes
    await flush();
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(store.state().currentId).toBe("b");
    expect(store.state().isPlaying).toBe(true);
  });

  it("does not start playback if the user pauses while loading", async () => {
    const { resolveAFn, ok, flush } = fetchStub();
    const engine = mockEngine();
    const store = createPlayerStore(engine);
    store.unlockAudio();
    store.playSong("a");
    store.pause();
    expect(store.state().isPlaying).toBe(false);

    resolveAFn(ok()); // load finishes after the pause
    await flush();
    expect(engine.play).not.toHaveBeenCalled();
    expect(store.state().isPlaying).toBe(false);
  });

  it("a stale failure does not clobber the newer song's state", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500 }))
      .mockImplementationOnce(() =>
        Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const engine = mockEngine();
    const store = createPlayerStore(engine);
    store.unlockAudio();
    store.playSong("a"); // will fail
    store.playSong("b"); // will succeed

    await new Promise((r) => setTimeout(r, 0));
    expect(store.state().currentId).toBe("b");
    expect(store.state().isPlaying).toBe(true);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });
});
