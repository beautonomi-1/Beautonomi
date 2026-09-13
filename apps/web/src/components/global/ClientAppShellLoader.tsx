"use client";

import type { OsType } from "@/lib/utils/os-type";
import type { RequestLanguageContext } from "@/lib/locale/resolve-request-language";
import ClientAppShell from "@/app/ClientAppShell";

interface ClientAppShellLoaderProps {
  children: React.ReactNode;
  osType: OsType;
  locale: RequestLanguageContext;
}

export default function ClientAppShellLoader({ children, osType, locale }: ClientAppShellLoaderProps) {
  return (
    <ClientAppShell osType={osType} locale={locale}>
      {children}
    </ClientAppShell>
  );
}
