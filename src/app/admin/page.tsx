// src/app/admin/page.tsx
// Host/admin screen: song metadata overrides and library rescan.
import { AdminPanel } from "@/components/AdminPanel";
import { branding } from "@/lib/branding";

export const metadata = { title: `${branding.name} Admin` };

export default function AdminPage() {
  return <AdminPanel />;
}
