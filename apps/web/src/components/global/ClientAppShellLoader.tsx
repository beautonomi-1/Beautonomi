"use client";

import dynamic from "next/dynamic";

const ClientAppShell = dynamic(() => import("@/app/ClientAppShell"), {
  ssr: false,
  loading: () => (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
      Loading…
    </div>
  ),
});

export default function ClientAppShellLoader({ children }: { children: React.ReactNode }) {
  return <ClientAppShell>{children}</ClientAppShell>;
}
