// SpessaSynth-backed player engine. Browser-only: this module must only ever
// be loaded via a lazy `import()` (see PlayerProvider) so the synth stays out
// of the initial page payload.
import type { PlayerEngine, PlayerEvent } from "@/lib/playerCore";
import type { Sequencer, WorkletSynthesizer } from "spessasynth_lib";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload type follows the engine contract
type Listener = (p?: any) => void;

const MIDI_CHANNEL_COUNT = 16;

export class SpessaEngine implements PlayerEngine {
  private ctx: AudioContext;
  private synth: WorkletSynthesizer | null = null;
  private seq: Sequencer | null = null;
  private gain: GainNode;
  private readyPromise: Promise<void> | null = null;
  // Continuous position source: SpessaSynth's `timeChange` event only fires on
  // discrete time changes (seek / song change), NOT every frame, so lyrics and
  // the intro countdown would freeze. We poll the sequencer's currentTime on
  // requestAnimationFrame while playing and emit it as "time".
  private timeRaf: number | null = null;
  private listeners: Record<PlayerEvent, Listener[]> = {
    lyric: [],
    time: [],
    songEnd: [],
    state: [],
  };

  constructor(
    private soundFontUrl = "/api/soundfont",
    private workletUrl = "/spessasynth_processor.min.js",
  ) {
    this.ctx = new AudioContext();
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload type follows the engine contract
  private emit(evt: PlayerEvent, p?: any) {
    for (const cb of this.listeners[evt]) cb(p);
  }

  /** Must be called from a real user gesture to satisfy autoplay policy. */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  ready(): Promise<void> {
    this.readyPromise ??= this.init();
    return this.readyPromise;
  }

  private async init(): Promise<void> {
    await this.ctx.audioWorklet.addModule(this.workletUrl);
    const { WorkletSynthesizer, Sequencer } = await import("spessasynth_lib");
    const synth = new WorkletSynthesizer(this.ctx);
    const res = await fetch(this.soundFontUrl);
    if (!res.ok) throw new Error(`failed to fetch soundfont: ${res.status}`);
    const sf = await res.arrayBuffer();
    await synth.soundBankManager.addSoundBank(sf, "main");
    synth.connect(this.gain);
    await synth.isReady;
    this.synth = synth;

    const seq = new Sequencer(synth);
    seq.eventHandler.addEvent("songEnded", "player", () => this.emit("songEnd", null));
    seq.eventHandler.addEvent("timeChange", "player", (t: number) => this.emit("time", t));
    seq.eventHandler.addEvent("songChange", "player", (data) => this.emit("state", data));
    seq.eventHandler.addEvent("textEvent", "player", (data) => {
      // Meta text events carry the raw text bytes on the MIDI message.
      const text = new TextDecoder().decode(data.event.data);
      if (text) this.emit("lyric", { text, lyricsIndex: data.lyricsIndex });
    });
    this.seq = seq;
  }

  async loadSong(buf: ArrayBuffer, fileName: string): Promise<void> {
    await this.ready();
    this.seq!.loadNewSongList([{ binary: buf, fileName }]);
    // loadNewSongList queues playback; keep control explicit.
    this.seq!.pause();
  }

  play(): void {
    void this.resume();
    this.seq?.play();
    this.emit("state", { isPlaying: true });
    this.startTimeLoop();
  }

  pause(): void {
    this.seq?.pause();
    this.stopTimeLoop();
    this.emit("state", { isPlaying: false });
  }

  stop(): void {
    if (!this.seq) return;
    this.seq.pause();
    this.seq.currentTime = 0;
    this.synth?.stopAll();
    this.stopTimeLoop();
    this.emit("state", { isPlaying: false });
    this.emit("time", 0);
  }

  // Poll the sequencer position each frame so the UI (lyrics, countdown) tracks
  // the real playback time instead of only reacting to discrete seeks. Emitted
  // at ~10 fps (not every frame) to keep React re-renders cheap on TV hardware.
  private startTimeLoop(): void {
    if (this.timeRaf !== null) return;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last >= 100) {
        last = ts;
        if (this.seq) this.emit("time", this.seq.currentTime);
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

  seek(sec: number): void {
    if (this.seq) this.seq.currentTime = sec;
    this.emit("time", sec);
  }

  setVolume(v: number): void {
    this.gain.gain.value = v;
  }

  setTempo(r: number): void {
    if (this.seq) this.seq.playbackRate = r;
  }

  setTranspose(semis: number): void {
    if (!this.synth) return;
    for (let ch = 0; ch < MIDI_CHANNEL_COUNT; ch++) {
      this.synth.midiChannels[ch].setSystemParameter("keyShift", semis);
    }
  }

  muteChannel(ch: number, muted: boolean): void {
    this.synth?.midiChannels[ch]?.setSystemParameter("isMuted", muted);
  }

  currentTime(): number {
    return this.seq?.currentTime ?? 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload type follows the engine contract
  on(evt: PlayerEvent, cb: (p?: any) => void): void {
    this.listeners[evt].push(cb);
  }
}
