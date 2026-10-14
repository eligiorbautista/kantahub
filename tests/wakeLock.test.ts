// Screen Wake Lock API wrapper tests. The real `navigator` global is never
// touched — every scenario injects a fake, matching the dependency-injection
// style of persistence.test.ts. The module holds one lock at a time, so each
// test begins by dropping whatever the previous one acquired.

import { describe, it, expect, beforeEach } from "vitest";
import { requestWakeLock, releaseWakeLock } from "@/lib/wakeLock";

// Minimal mutable stand-in for a WakeLockSentinel. The DOM type marks
// `released` readonly, but tests must simulate the browser revoking it.
type FakeSentinel = { released: boolean; release(): Promise<void> };

function makeSentinel(): FakeSentinel {
  const s = {
    released: false,
    release: async () => {
      s.released = true;
    },
  };
  return s;
}

const toNav = (wakeLock: unknown) => ({ wakeLock }) as unknown as Navigator;

// The wake lock is a shared module singleton; reset it between tests.
beforeEach(async () => {
  await releaseWakeLock();
});

describe("requestWakeLock", () => {
  it("returns null when the API is unsupported", async () => {
    const nav = {} as Navigator;
    expect(await requestWakeLock(nav)).toBeNull();
  });
  it("requests a screen lock when supported", async () => {
    let called = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- spec test shape (brief asserts with as any)
    const nav = { wakeLock: { request: async (t: string) => { called = t; return {} as any; } } } as any;
    await requestWakeLock(nav);
    expect(called).toBe("screen");
  });
});

// R-nothrow: requestWakeLock must never throw, and must return null when
// a lock is already active rather than stacking a second sentinel.
describe("requestWakeLock no-throw guarantees", () => {
  it("returns null when a lock is already active", async () => {
    const sentinel = makeSentinel();
    const nav = toNav({ request: async () => sentinel });
    expect(await requestWakeLock(nav)).toBe(sentinel);
    expect(await requestWakeLock(nav)).toBeNull();
  });

  it("returns null when the browser rejects the request", async () => {
    const nav = toNav({
      request: async () => {
        throw new Error("not allowed");
      },
    });
    await expect(requestWakeLock(nav)).resolves.toBeNull();
  });

  it("treats a browser-revoked lock as no longer active", async () => {
    const revoked = makeSentinel();
    const replacement = makeSentinel();
    let calls = 0;
    const nav = toNav({ request: async () => (calls++ === 0 ? revoked : replacement) });
    expect(await requestWakeLock(nav)).toBe(revoked);
    revoked.released = true; // the browser hid the page and took the lock back
    expect(await requestWakeLock(nav)).toBe(replacement);
  });

  it("does not stack requests while one is still in flight", async () => {
    let calls = 0;
    let grant!: (s: FakeSentinel) => void;
    const slow = new Promise<FakeSentinel>((res) => {
      grant = res;
    });
    const nav = toNav({ request: () => { calls++; return slow; } });
    const first = requestWakeLock(nav);
    expect(await requestWakeLock(nav)).toBeNull();
    grant(makeSentinel());
    expect(await first).not.toBeNull();
    expect(calls).toBe(1);
  });

  it("drops a lock granted after the player already paused", async () => {
    const sentinel = makeSentinel();
    let grant!: (s: FakeSentinel) => void;
    const slow = new Promise<FakeSentinel>((res) => {
      grant = res;
    });
    const nav = toNav({ request: () => slow });
    const inFlight = requestWakeLock(nav);
    await releaseWakeLock(); // pause/stop beat the browser to it
    grant(sentinel);
    expect(await inFlight).toBeNull();
    expect(sentinel.released).toBe(true);
  });
});

describe("releaseWakeLock", () => {
  it("releases the active sentinel so the screen may sleep", async () => {
    const sentinel = makeSentinel();
    const nav = toNav({ request: async () => sentinel });
    await requestWakeLock(nav);
    await releaseWakeLock();
    expect(sentinel.released).toBe(true);
  });

  it("lets the next play take a fresh lock", async () => {
    const first = makeSentinel();
    const second = makeSentinel();
    let calls = 0;
    const nav = toNav({ request: async () => (calls++ === 0 ? first : second) });
    await requestWakeLock(nav);
    await releaseWakeLock();
    expect(await requestWakeLock(nav)).toBe(second);
    expect(first.released).toBe(true);
    expect(second.released).toBe(false);
  });

  it("is a harmless no-op with nothing active", async () => {
    await expect(releaseWakeLock()).resolves.toBeUndefined();
  });

  it("swallows a throwing release()", async () => {
    const sentinel: FakeSentinel = {
      released: false,
      release: async () => {
        throw new Error("already gone");
      },
    };
    const nav = toNav({ request: async () => sentinel });
    await requestWakeLock(nav);
    await expect(releaseWakeLock()).resolves.toBeUndefined();
  });
});
