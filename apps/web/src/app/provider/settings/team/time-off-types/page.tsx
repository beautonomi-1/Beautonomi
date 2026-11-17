"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import EmptyState from "@/components/ui/empty-state";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Badge } from "@/components/ui/badge";

interface TimeOffType {
  id: string;
  name: string;
  description?: string | null;
  is_paid: boolean;
  is_active: boolean;
}

export default function TimeOffTypesSettings() {
  const { t } = useTranslation();
  const [types, setTypes] = useState<TimeOffType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTypes();
  }, []);

  const loadTypes = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: TimeOffType[] }>(
        "/api/provider/time-off-types"
      );
      setTypes(response.data || []);
    } catch (error: unknown) {
      console.error("Error loading time off types:", error);
      toast.error(t("web.provider.settings.pages.team/time-off-types.failedToLoadTimeOffTypes"));
    } finally {
      setIsLoading(false);
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.team/time-off-types.team"), href: "/provider/settings/team/roles" },
    { label: t("web.provider.settings.pages.team/time-off-types.timeOffTypes") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.team.items.timeOffTypes.title")}
        subtitle={t("web.provider.settings.categories.team.items.timeOffTypes.description")}
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
          <LoadingTimeout loadingMessage={t("web.provider.settings.pages.team/time-off-types.loadingTimeOffTypes")} />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.pages.team/time-off-types.timeOffTypes")}
      subtitle={t("web.provider.settings.pages.team/time-off-types.manageTimeOffCategoriesForYour")}
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-4 sm:space-y-6">
        <p className="text-sm text-gray-600">
          {t("web.provider.settings.pages.team/time-off-types.createHint")}
        </p>

        {types.length === 0 ? (
          <SectionCard className="p-8 sm:p-12">
            <EmptyState
              title={t("web.provider.settings.pages.team/time-off-types.noTimeOffTypesYet")}
              description={t("web.provider.settings.pages.team/time-off-types.createHint")}
            />
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {types.map((type) => (
              <SectionCard key={type.id} className="p-4 sm:p-6">
                <h3 className="font-semibold text-base sm:text-lg mb-1">{type.name}</h3>
                {type.description && (
                  <p className="text-sm text-gray-600 mb-2">{type.description}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Badge
                    className={type.is_paid ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}
                  >
                    {type.is_paid ? t("web.provider.settings.pages.team/time-off-types.paid") : t("web.provider.settings.pages.team/time-off-types.unpaid")}
                  </Badge>
                  <Badge
                    className={type.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                  >
                    {type.is_active ? t("web.provider.common.active") : t("web.provider.common.inactive")}
                  </Badge>
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
