/**
 * Fetches maintenance config for provider_app. If enabled, renders MaintenanceScreen; otherwise children.
 */
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { APP_URL } from "@/config/public-env";
import MaintenanceScreen from "./MaintenanceScreen";
import type { MaintenanceConfig } from "./MaintenanceScreen";

const SCOPE = "provider_app";

function getBaseUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const origin = window.location.origin;
    if (origin === "http://localhost:8081" || origin === "http://localhost:8082" || !APP_URL?.trim()) {
      return "http://localhost:3000";
    }
  }
  return APP_URL?.trim() || "";
}

export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<MaintenanceConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const baseUrl = getBaseUrl();
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
