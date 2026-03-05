"use client";

import dynamic from "next/dynamic";
import type { OsType } from "@/lib/utils/os-type";
import { BeautonomiLoadingIcon } from "@/components/BeautonomiLoadingIcon";

const ClientAppShell = dynamic(() => import("@/app/ClientAppShell"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-white" aria-busy="true" aria-live="polite">
      <BeautonomiLoadingIcon size={56} />
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
