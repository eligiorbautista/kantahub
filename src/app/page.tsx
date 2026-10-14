// src/app/page.tsx
// The controller screen: search, song-number entry, queue building/management,
// and playback control from any phone, tablet, laptop, or desktop. The TV
// screen lives at /tv.
import { Controller } from "@/components/Controller";
import { branding } from "@/lib/branding";

export const metadata = { title: `${branding.name} Controller` };

export default function Home() {
  return <Controller />;
}
