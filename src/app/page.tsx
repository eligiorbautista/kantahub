import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import { PlayerProvider } from "@/components/PlayerProvider";
import { TvShell } from "@/components/TvShell";
import { baseUrlForRequest, buildRemoteUrlFromBase } from "@/lib/network";
import { randomSessionId } from "@/lib/session";

export default function Home() {
  return (
    <PlayerProvider>
      {/* The shell (player provider) prerenders; the paired shell streams in
          because the request Host + session id are runtime facts (R-w6). */}
      <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0b0b12" }} />}>
        <PairedTvShell />
      </Suspense>
    </PlayerProvider>
  );
}

async function PairedTvShell() {
  // The advertised base URL and the pairing session are runtime facts: mark
  // this subtree dynamic under Cache Components (R-w6). The TV session id is
  // regenerated on every page load (R-session). The Host header is used so the
  // QR points at the address the TV actually reached (correct behind Docker).
  await connection();
  const host = (await headers()).get("host");
  const session = randomSessionId();
  const remoteUrl = buildRemoteUrlFromBase(baseUrlForRequest(host), session);
  return <TvShell remoteSession={session} remoteUrl={remoteUrl} />;
}
