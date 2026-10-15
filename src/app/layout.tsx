import type { Metadata } from "next";
import { branding } from "@/lib/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: branding.name,
  description: "Self-hosted browser karaoke for your home TV.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // No web-font loading: the UI is styled with the system sans stack (see
  // globals.css). That keeps `next build` from reaching out to
  // fonts.googleapis.com, so builds do not depend on a third-party font CDN.
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
