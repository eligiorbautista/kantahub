"use client";

// src/lib/hardReload.ts
// Clear anything the browser may have cached for this app, then reload with a
// cache-busting query so the HTML (and therefore the current JS chunk hashes)
// is fetched fresh. Used by the "refresh all" control on the controller.
export async function hardReload(nonce: number): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Cache Storage may be unavailable; a plain reload still helps.
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
  } catch {
    // No service worker control here; ignore.
  }

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("r", String(nonce));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}
