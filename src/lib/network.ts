// src/lib/network.ts
// Server LAN base-URL detection for the phone-remote QR code.
// Honors PUBLIC_URL when set; otherwise picks the first non-loopback IPv4
// address from os.networkInterfaces() on the current PORT (default 3000).
// Never throws — odd network setups fall back to http://localhost:<PORT>.

import os from "node:os";

const DEFAULT_PORT = "3000";

function getPort(): string {
  return process.env.PORT || DEFAULT_PORT;
}

/** First non-loopback (non-internal) IPv4 address, or null if none found. */
function firstLanIPv4(): string | null {
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      const addrs = ifaces[name] ?? [];
      for (const addr of addrs) {
        if (addr.family === "IPv4" && !addr.internal) {
          return addr.address;
        }
      }
    }
  } catch {
    // Ignore; fall back to localhost below.
  }
  return null;
}

export function getServerBaseUrl(): string {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL;
  }
  const port = getPort();
  const ip = firstLanIPv4();
  return `http://${ip ?? "localhost"}:${port}`;
}

/** Pure helper: build the phone-remote URL from a given base + session id. */
export function buildRemoteUrlFromBase(base: string, session: string): string {
  const trimmed = base.replace(/\/+$/, "");
  return `${trimmed}/remote?session=${session}`;
}

export function buildRemoteUrl(session: string): string {
  return buildRemoteUrlFromBase(getServerBaseUrl(), session);
}
