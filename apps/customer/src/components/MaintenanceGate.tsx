/**
 * Fetches maintenance config for customer_app. If enabled, renders MaintenanceScreen; otherwise children.
 */
import React, { useEffect, useState } from "react";
import { APP_URL } from "@/config/public-env";
import MaintenanceScreen from "./MaintenanceScreen";
import type { MaintenanceConfig } from "./MaintenanceScreen";

const SCOPE = "customer_app";

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<MaintenanceConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const baseUrl = APP_URL?.trim();
    if (!baseUrl) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`${baseUrl}/api/public/maintenance?scope=${SCOPE}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: MaintenanceConfig) => {
        if (!cancelled) setConfig(data);
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
  }, []);

  if (loading || !config) return <>{children}</>;
  if (!config.enabled) return <>{children}</>;

  return <MaintenanceScreen config={config} scope={SCOPE} />;
}
