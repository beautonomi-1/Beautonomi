"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import MaintenanceView from "./MaintenanceView";
import type { MaintenanceScope, PublicMaintenanceResponse } from "@/lib/maintenance-types";
import { resolveWebMaintenanceFetch } from "@/lib/maintenance-web-path-scope";

function maintenanceScopeFromResolution(
  r: ReturnType<typeof resolveWebMaintenanceFetch>
): MaintenanceScope | null {
  if (r.mode === "public_site") return "public_site";
  if (r.mode === "provider_web") return "provider_web";
  return null;
}

function shouldShowMaintenanceOverlay(params: {
  resolution: ReturnType<typeof resolveWebMaintenanceFetch>;
  preview: boolean;
  config: PublicMaintenanceResponse | null;
}): boolean {
  const { resolution, preview, config } = params;
  if (preview) return Boolean(config);
  if (!config?.enabled) return false;
  if (resolution.mode === "provider_web" && resolution.pathVariant === "funnel") {
    const allowFunnel = config.allow_partner_funnel !== false;
    return !allowFunnel;
  }
  return true;
}

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resolution = resolveWebMaintenanceFetch(pathname);
  const fetchScope = maintenanceScopeFromResolution(resolution);

  const [config, setConfig] = useState<PublicMaintenanceResponse | null>(null);
  const [loading, setLoading] = useState(!!fetchScope);
  const preview = searchParams.get("maintenance_preview");

  useEffect(() => {
    if (!fetchScope) {
      setConfig(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/public/maintenance?scope=${fetchScope}`, { cache: "no-store" })
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
  }, [fetchScope]);

  if (resolution.mode === "none") return <>{children}</>;
  if (loading) return <>{children}</>;

  const showMaintenance = shouldShowMaintenanceOverlay({
    resolution,
    preview: Boolean(preview),
    config,
  });

  if (!showMaintenance || !config) return <>{children}</>;

  const viewScope: MaintenanceScope = fetchScope ?? "public_site";
  return <MaintenanceView config={config} scope={viewScope} />;
}
