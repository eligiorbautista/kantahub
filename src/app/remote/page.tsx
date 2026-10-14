// src/app/remote/page.tsx
// The old per-session phone remote is superseded by the room controller at /.
// Redirect so any saved QR/link keeps working.
import { redirect } from "next/navigation";

export default function RemotePage() {
  redirect("/");
}
