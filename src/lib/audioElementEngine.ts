"use client";

// src/lib/audioElementEngine.ts
// A PlayerEngine backed by a plain <audio> element playing the server-rendered
// WAV (see src/lib/renderAudio.ts).
//
// Used when the browser cannot run the Web Audio worklet — most importantly on a
// plain http:// origin, where a Smart TV's browser blocks it. An <audio> element
// has no such restriction. Bonus: the element's own currentTime IS the audible
// position (output latency included), so the lyrics track the sound exactly.
import type { PlayerEngine, PlayerEvent } from "@/lib/playerCore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload type follows the engine contract
type Listener = (p?: any) => void;

export class AudioElementEngine implements PlayerEngine {
  /** The store hands over the song id; this engine streams the rendered audio. */
  readonly wantsBytes = false;
  private el: HTMLAudioElement;
  private listeners: Record<PlayerEvent, Listener[]> = { lyric: [], time: [], songEnd: [], state: [] };
  private timeRaf: number | null = null;

  constructor(private onFatalError?: (message: string) => void) {
    this.el = new Audio();
    this.el.preload = "auto";
    this.el.addEventListener("ended", () => {
      this.stopTimeLoop();
      this.emit("songEnd", null);
    });
    this.el.addEventListener("play", () => this.emit("state", { isPlaying: true }));
    this.el.addEventListener("pause", () => this.emit("state", { isPlaying: false }));
    this.el.addEventListener("error", () => {
      this.stopTimeLoop();
      this.emit("state", { isPlaying: false });
      // The server could not render this song (no soundfont, unknown id, or the
      // renderer failed) — say so instead of silently doing nothing.
      this.onFatalError?.("The server could not prepare the audio for this song.");
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload type follows the engine contract
  private emit(evt: PlayerEvent, p?: any) {
    for (const cb of this.listeners[evt]) cb(p);
  }

  ready(): Promise<void> {
    return Promise.resolve();
  }

  async loadSong(source: ArrayBuffer | string): Promise<void> {
    const id = typeof source === "string" ? source : null;
    if (!id) throw new Error("AudioElementEngine expects a song id");
    this.el.pause();
    this.el.src = `/api/songs/${encodeURIComponent(id)}/audio`;
    this.el.load();
    // The first play of a song waits for the server render, so give it time to
    // become playable before the store calls play().
    await new Promise<void>((resolve) => {
      const done = () => {
        this.el.removeEventListener("loadeddata", done);
        this.el.removeEventListener("canplay", done);
        this.el.removeEventListener("error", done);
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(done, 120_000);
      this.el.addEventListener("loadeddata", done, { once: true });
      this.el.addEventListener("canplay", done, { once: true });
      this.el.addEventListener("error", done, { once: true });
    });
  }

  play(): void {
    void this.el.play().catch((err: unknown) => {
      // Autoplay policy: the browser wants a user gesture first. The TV shows a
      // "press OK" hint and retries when one arrives.
      this.emit("state", { isPlaying: false });
      console.warn("kantahub: playback needs a user gesture:", err);
    });
    this.startTimeLoop();
  }

  /** Called from a user gesture: start (or resume) the loaded song. */
  async resume(): Promise<void> {
    if (!this.el.src || !this.el.paused) return;
    try {
      await this.el.play();
    } catch {
      // Still blocked; nothing more to do until the next gesture.
    }
  }

  pause(): void {
    this.el.pause();
    this.stopTimeLoop();
  }

  stop(): void {
    this.el.pause();
    this.el.currentTime = 0;
    this.el.removeAttribute("src");
    this.el.load();
    this.stopTimeLoop();
    this.emit("time", 0);
  }

  seek(sec: number): void {
    try {
      this.el.currentTime = Math.max(0, sec);
    } catch {
      // Seeking before the file is ready; the next time event corrects the UI.
    }
    this.emit("time", Math.max(0, sec));
  }

  setVolume(v: number): void {
    this.el.volume = Math.min(1, Math.max(0, v));
  }

  // A rendered file cannot be re-tempoed, transposed or channel-muted; these
  // stay as no-ops so the engine contract is satisfied.
  setTempo(): void {}
  setTranspose(): void {}
  muteChannel(): void {}

  currentTime(): number {
    return Number.isFinite(this.el.currentTime) ? this.el.currentTime : 0;
  }

  /** Running when the element is actually playing (and has data). */
  isRunning(): boolean {
    return !this.el.paused && this.el.readyState >= 2;
  }

  private startTimeLoop(): void {
    if (this.timeRaf !== null) return;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last >= 100) {
        last = ts;
        this.emit("time", this.currentTime());
      }
      this.timeRaf = requestAnimationFrame(loop);
    };
    this.timeRaf = requestAnimationFrame(loop);
  }

  private stopTimeLoop(): void {
    if (this.timeRaf !== null) {
      cancelAnimationFrame(this.timeRaf);
      this.timeRaf = null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload type follows the engine contract
  on(evt: PlayerEvent, cb: (p?: any) => void): void {
    this.listeners[evt].push(cb);
  }
}
