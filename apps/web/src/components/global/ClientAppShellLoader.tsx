"use client";

import type { OsType } from "@/lib/utils/os-type";
import ClientAppShell from "@/app/ClientAppShell";

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
