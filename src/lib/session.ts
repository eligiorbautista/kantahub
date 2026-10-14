// src/lib/session.ts
// Random session ids for TV ↔ phone pairing. The id goes into the QR URL
// and names the in-memory remote state session, so 8 base36 chars (~41
// bits) is plenty: it only needs to be unguessable enough to keep other
// LAN strangers from hijacking your karaoke night.

/** Returns an 8-char lowercase base36 id (matches /^[0-9a-z]{8}$/). */
export function randomSessionId(): string {
  const bytes = randomBytes(8);
  // Convert each byte to a base36 digit; no bias concern at this length —
  // uniformity is a nice-to-have, collisions/guessing are not the threat.
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += (bytes[i] % 36).toString(36);
  }
  return id;
}

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(buf);
  }
  for (let i = 0; i < n; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}
