"use client";

import React, { useState, useEffect, useCallback } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import {
  ProviderGamificationContent,
  type ProviderGamificationData,
} from "@/components/provider/gamification/ProviderGamificationContent";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { handleError } from "@/lib/provider-portal/error-handler";

const BREADCRUMBS = [
  { label: "Home", href: "/" },
  { label: "Provider", href: "/provider" },
  { label: "Rewards" },
];

export default function ProviderGamificationPage() {
  const [data, setData] = useState<ProviderGamificationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const loadGamificationData = useCallback(async (initializeIfNeeded = false) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: ProviderGamificationData }>(
        "/api/provider/gamification",
      );

      if (initializeIfNeeded && (!response.data.points || response.data.points.total === 0)) {
        try {
          await fetcher.post("/api/provider/gamification", {});
          const updatedResponse = await fetcher.get<{ data: ProviderGamificationData }>(
            "/api/provider/gamification",
          );
          setData(updatedResponse.data);
        } catch (initErr) {
          console.warn("Failed to initialize points:", initErr);
          setData(response.data);
        }
      } else {
        setData(response.data);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load rewards data";
      setError(errorMessage);
      handleError(err, {
        action: "loadGamification",
        resource: "gamification data",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRecalculate = async () => {
    try {
      setIsRecalculating(true);
      await fetcher.post("/api/provider/gamification", {});
      await loadGamificationData();
    } catch (err) {
      handleError(err, {
        action: "recalculateGamification",
        resource: "gamification data",
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  useEffect(() => {
    loadGamificationData(true);
  }, [loadGamificationData]);

  if (isLoading) {
    return (
      <SettingsDetailLayout title="Rewards" breadcrumbs={BREADCRUMBS}>
        <LoadingTimeout loadingMessage="Loading rewards…" timeoutMs={10000} />
      </SettingsDetailLayout>
    );
  }

  if (error || !data) {
    return (
      <SettingsDetailLayout title="Rewards" breadcrumbs={BREADCRUMBS}>
        <EmptyState
          title="Failed to load rewards"
          description={error || "Unable to load your points and badges"}
          action={{
            label: "Retry",
            onClick: () => loadGamificationData(),
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout title="Rewards" breadcrumbs={BREADCRUMBS}>
      <PageHeader
        title="Rewards & badges"
        subtitle="Earn points, unlock levels, and grow your profile visibility"
      />
      <ProviderGamificationContent
        data={data}
        isRecalculating={isRecalculating}
        onRecalculate={handleRecalculate}
      />
    </SettingsDetailLayout>
  );
}
