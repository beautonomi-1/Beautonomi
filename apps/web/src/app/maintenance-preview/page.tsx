"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import MaintenanceView from "@/components/maintenance/MaintenanceView";
import type { MaintenanceScope, PublicMaintenanceResponse } from "@/lib/maintenance-types";
import { MAINTENANCE_SCOPES } from "@/lib/maintenance-types";

/**
 * Standalone maintenance preview for app scopes (customer_app, provider_app).
 * Open in iframe from Admin > Maintenance: Preview link for those scopes.
 * Also supports public_site / provider_web for a consistent preview URL shape.
 */
export default function MaintenancePreviewPage() {
  const searchParams = useSearchParams();
  const scopeParam = searchParams.get("scope") as MaintenanceScope | null;
  const scope = scopeParam && MAINTENANCE_SCOPES.includes(scopeParam) ? scopeParam : "customer_app";

  const [config, setConfig] = useState<PublicMaintenanceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/maintenance?scope=${scope}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: PublicMaintenanceResponse) => {
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
  }, [scope]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Could not load maintenance config.</p>
      </div>
    );
  }

  return <MaintenanceView config={config} scope={scope} />;
}
