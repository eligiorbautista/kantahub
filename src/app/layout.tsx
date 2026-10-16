import type { ReactNode } from "react";
import type { Metadata } from "next";
import { branding } from "@/lib/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: branding.name,
  description: "Self-hosted browser karaoke for your home TV.",
};

// Explicit prop types rather than the framework-generated `LayoutProps`: those
// live in `.next/types` and only exist after a build, so a plain
// `tsc --noEmit` (in CI, or on a fresh clone) would fail without one.
export default function RootLayout({ children }: { children: ReactNode }) {
  // No web-font loading: the UI is styled with the system sans stack (see
  // globals.css). That keeps `next build` from reaching out to
  // fonts.googleapis.com, so builds do not depend on a third-party font CDN.
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
