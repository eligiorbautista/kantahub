// src/lib/network.ts
// Server base-URL detection for the phone-remote QR code.
// Precedence: PUBLIC_URL when set, then the incoming request's Host header
// (correct behind Docker/NAT, where os.networkInterfaces() reports the
// container's internal IP), then the first non-loopback IPv4 as a fallback.
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

/**
 * Base URL to advertise for an incoming request.
 * PUBLIC_URL wins; otherwise the request's Host header is used (this is the
 * address the client actually reached us on — correct inside Docker, where
 * os.networkInterfaces() would report the container's internal IP); the LAN
 * auto-detection is a last-resort fallback.
 */
export function baseUrlForRequest(host: string | null | undefined): string {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL;
  }
  if (host) {
    return `http://${host}`;
  }
  return getServerBaseUrl();
}
