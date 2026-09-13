"use client";

import { useTranslation } from "@beautonomi/i18n";
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

export default function ProviderGamificationPage() {
  const { t } = useTranslation();
  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.gamificationPage.pageTitle") },
  ];
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

      const needsPostHeal =
        initializeIfNeeded &&
        (response.data.points?.total ?? 0) === 0 &&
        ((response.data.provider_stats?.total_bookings ?? 0) > 0 ||
          (response.data.provider_stats?.review_count ?? 0) > 0);

      if (needsPostHeal) {
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
const errorMessage = err instanceof Error ? err.message : t("web.provider.gamificationPage.loadFailed");
      setError(errorMessage);
      handleError(err, {
        action: "loadGamification",
        resource: "gamification data",
      });
    } finally {
      setIsLoading(false);
    }
  }, [t]);

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
<SettingsDetailLayout title={t("web.provider.gamificationPage.pageTitle")} breadcrumbs={breadcrumbs}>
        <LoadingTimeout loadingMessage={t("web.provider.gamificationPage.loading")} timeoutMs={10000} />
      </SettingsDetailLayout>
    );
  }

  if (error || !data) {
    return (
<SettingsDetailLayout title={t("web.provider.gamificationPage.pageTitle")} breadcrumbs={breadcrumbs}>
        <EmptyState
          title={t("web.provider.gamificationPage.loadFailedTitle")}
          description={error || t("web.provider.gamificationPage.loadFailedDesc")}
          action={{
            label: t("web.provider.common.retry"),
            onClick: () => loadGamificationData(),
          }}
        />
      </SettingsDetailLayout>
    );
  }

  return (
<SettingsDetailLayout title={t("web.provider.gamificationPage.pageTitle")} breadcrumbs={breadcrumbs}>
      <PageHeader
        title={t("web.provider.gamificationPage.title")}
        subtitle={t("web.provider.gamificationPage.subtitle")}
      />
      <ProviderGamificationContent
        data={data}
        isRecalculating={isRecalculating}
        onRecalculate={handleRecalculate}
      />
    </SettingsDetailLayout>
  );
}
