"use client";

import dynamic from "next/dynamic";
import type { OsType } from "@/lib/utils/os-type";

const ClientAppShell = dynamic(() => import("@/app/ClientAppShell"), {
  ssr: false,
  loading: () => (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
      Loading…
    </div>
  ),
});

interface ClientAppShellLoaderProps {
  children: React.ReactNode;
  osType: OsType;
}

export default function ClientAppShellLoader({ children, osType }: ClientAppShellLoaderProps) {
  return (
    <ClientAppShell osType={osType}>
      {children}
    </ClientAppShell>
  );
}
