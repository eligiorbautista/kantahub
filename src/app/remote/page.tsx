// Phone remote page (/remote?session=<id>). The session id comes from the
// query string; reading it here (server side) makes the page dynamic and lets
// the remote shell render server-side, so the page is never blank while the
// client hydrates. The heavy lifting still lives in the RemoteControl client
// component, which deliberately does NOT pull in the SpessaSynth player core
// (R-bundle).
import { RemoteControl } from "@/components/RemoteControl";
import { branding } from "@/lib/branding";

export const metadata = { title: `${branding.name} Remote` };

export default async function RemotePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  return <RemoteControl session={session ?? ""} />;
}
