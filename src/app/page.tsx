import { PlayerProvider } from "@/components/PlayerProvider";
import { TvShell } from "@/components/TvShell";

export default function Home() {
  return (
    <PlayerProvider>
      <TvShell />
    </PlayerProvider>
  );
}
