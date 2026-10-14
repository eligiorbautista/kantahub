// Phone remote page (/remote?session=<id>). The heavy lifting lives in the
// RemoteControl client component, which reads the session from the query
// string, so it must render inside a Suspense boundary. This page is a
// static shell — no runtime data is read here — and it deliberately does
// NOT pull in the SpessaSynth player core (R-bundle).
import { Suspense } from "react";
import { RemoteControl } from "@/components/RemoteControl";
import { branding } from "@/lib/branding";

export const metadata = { title: `${branding.name} Remote` };

export default function RemotePage() {
  return (
    <Suspense fallback={null}>
      <RemoteControl />
    </Suspense>
  );
}
