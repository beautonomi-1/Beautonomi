"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import MaintenanceView from "./MaintenanceView";
import type { MaintenanceScope, PublicMaintenanceResponse } from "@/lib/maintenance-types";

const SCOPES_NO_GATE = ["/admin", "/account-settings", "/portal", "/auth", "/api", "/maintenance-preview"] as const;

function getScope(pathname: string): MaintenanceScope | null {
  if (pathname.startsWith("/provider")) return "provider_web";
  for (const p of SCOPES_NO_GATE) {
    if (pathname === p || pathname.startsWith(p + "/")) return null;
  }
  return "public_site";
}

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = getScope(pathname);

  const [config, setConfig] = useState<PublicMaintenanceResponse | null>(null);
  const [loading, setLoading] = useState(!!scope);
  const preview = searchParams.get("maintenance_preview");

  useEffect(() => {
    if (!scope) {
      setConfig(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/public/maintenance?scope=${scope}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: PublicMaintenanceResponse) => {
        if (!cancelled) {
          setConfig(data);
        }
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  if (!scope) return <>{children}</>;
  if (loading) return <>{children}</>;
  const showMaintenance = Boolean(preview) || Boolean(config?.enabled);
  if (!showMaintenance || !config) return <>{children}</>;

  return <MaintenanceView config={config} scope={scope} />;
}
