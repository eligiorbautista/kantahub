// tests/audioSupport.test.ts
// The AudioWorklet API is only exposed in a secure context, which is what
// decides whether the karaoke engine can run on this origin. Two traps this
// guards against:
//   - reading `AudioContext.prototype.audioWorklet` throws in some browsers
//     ("called on an object that does not implement interface
//     BaseAudioContext"), which took the whole TV screen down;
//   - `AudioWorkletNode` is exposed on insecure origins too, so it cannot be
//     used as the signal.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { audioWorkletSupported, resetAudioSupportCache } from "@/lib/audioSupport";

describe("audioWorkletSupported", () => {
  beforeEach(() => resetAudioSupportCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    resetAudioSupportCache();
  });

  it("is false when there is no AudioContext and no AudioWorklet interface", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("AudioWorklet", undefined);
    expect(audioWorkletSupported()).toBe(false);
  });

  it("is true when the AudioWorklet interface is exposed (secure origin)", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("AudioWorklet", class AudioWorkletStub {});
    expect(audioWorkletSupported()).toBe(true);
  });

  it("uses a throwaway AudioContext when one can be built", () => {
    const close = vi.fn();
    vi.stubGlobal("AudioContext", class {
      audioWorklet = {};
      close = close;
    });
    expect(audioWorkletSupported()).toBe(true);
    expect(close).toHaveBeenCalled();
  });

  it("is false when a context exists but exposes no audioWorklet (insecure origin)", () => {
    const close = vi.fn();
    vi.stubGlobal("AudioContext", class {
      close = close;
    });
    expect(audioWorkletSupported()).toBe(false);
    expect(close).toHaveBeenCalled();
  });

  it("never throws, even if reading the accessor throws", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("AudioWorklet", undefined);
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "AudioWorklet");
    Object.defineProperty(globalThis, "AudioWorklet", {
      configurable: true,
      get() {
        throw new TypeError(
          "'get audioWorklet' called on an object that does not implement interface BaseAudioContext.",
        );
      },
    });
    try {
      expect(audioWorkletSupported()).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "AudioWorklet", descriptor);
      else delete (globalThis as Record<string, unknown>).AudioWorklet;
    }
  });
});
