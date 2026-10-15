// src/app/tv/page.tsx
// The dedicated Smart TV screen. Fullscreen, lyrics-first, remote-driven; it
// owns the audio engine and mirrors the shared room state. The QR points phones
// at the controller (/).
import { connection } from "next/server";
import { headers } from "next/headers";
import { PlayerProvider } from "@/components/PlayerProvider";
import { TvDisplay } from "@/components/TvDisplay";
import { baseUrlForRequest } from "@/lib/network";
import { branding } from "@/lib/branding";

export const metadata = { title: `${branding.name} TV` };

export default async function TvPage() {
  // The advertised base URL is a runtime fact (request Host), so mark the page
  // dynamic under Cache Components.
  await connection();
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const controllerUrl = baseUrlForRequest(host, requestHeaders.get("x-forwarded-proto"));
  return (
    <PlayerProvider>
      <TvDisplay controllerUrl={controllerUrl} />
    </PlayerProvider>
  );
}
