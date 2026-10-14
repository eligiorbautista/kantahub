"use client";

// TV-side pairing panel: renders a scannable QR of the phone-remote URL
// (built server-side via buildRemoteUrl) plus the URL as text for manual
// entry. Compact enough to sit in the TV header permanently.
import { useEffect, useState } from "react";
import { toDataURL } from "qrcode";

export function QrPanel({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const png = await toDataURL(url, { margin: 1, width: 220 });
        if (!cancelled) setDataUrl(png);
      } catch (err) {
        console.error("QR generation failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div
      aria-label="Phone remote pairing"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.8vw",
        background: "rgba(255,255,255,0.06)",
        borderRadius: "0.6vw",
        padding: "0.5vw 0.8vw",
      }}
    >
      {dataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt="QR code linking to the phone remote"
          style={{ width: "6vw", height: "6vw", borderRadius: "0.4vw" }}
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.2vw" }}>
        <span style={{ fontSize: "0.9vw", opacity: 0.7 }}>Scan for phone remote</span>
        <span style={{ fontSize: "0.85vw", opacity: 0.9, wordBreak: "break-all" }}>{url}</span>
      </div>
    </div>
  );
}
