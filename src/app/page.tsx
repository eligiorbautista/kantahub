import { Suspense } from "react";
import { connection } from "next/server";
import { PlayerProvider } from "@/components/PlayerProvider";
import { TvShell } from "@/components/TvShell";
import { buildRemoteUrl } from "@/lib/network";
import { randomSessionId } from "@/lib/session";

export default function Home() {
  return (
    <PlayerProvider>
      {/* The shell (player provider) prerenders; the paired shell streams in
          because the LAN base URL + session id are runtime facts (R-w6). */}
      <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0b0b12" }} />}>
        <PairedTvShell />
      </Suspense>
    </PlayerProvider>
  );
}

async function PairedTvShell() {
  // The LAN base URL (network interfaces, env) and the pairing session are
  // runtime facts: mark this subtree dynamic under Cache Components (R-w6).
  // The TV session id is regenerated on every page load (R-session).
  await connection();
  const session = randomSessionId();
  return <TvShell remoteSession={session} remoteUrl={buildRemoteUrl(session)} />;
}
