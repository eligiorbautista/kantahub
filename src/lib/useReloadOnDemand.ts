"use client";

// src/lib/useReloadOnDemand.ts
// Reload this page (after clearing caches) whenever the room's reload nonce
// increases. The value first seen is only recorded, so opening a page does not
// trigger a reload — only a later "refresh all" from the controller does.
import { useEffect, useRef } from "react";
import { hardReload } from "@/lib/hardReload";

export function useReloadOnDemand(nonce: number | undefined): void {
  const seenRef = useRef<number | null>(null);

  useEffect(() => {
    if (nonce === undefined) return;
    if (seenRef.current === null) {
      seenRef.current = nonce;
      return;
    }
    if (nonce > seenRef.current) {
      seenRef.current = nonce;
      void hardReload(nonce);
    }
  }, [nonce]);
}
