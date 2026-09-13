"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Calendar, TrendingUp, DollarSign, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { format, subMonths } from "date-fns";
import { useTenantLocaleTag } from "@/hooks/useTenantLocaleTag";
import { EmptyReportState } from "@/app/provider/reports/components/EmptyReportState";

interface ZoneAnalytics {
  zone_id: string;
  zone_name: string;
  zone_type: string;
  is_active: boolean;
  total_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  total_revenue: number;
  total_travel_fees: number;
  average_booking_value: number;
  completion_rate: number;
}

interface AnalyticsData {
  zones: ZoneAnalytics[];
  summary: {
    total_zones: number;
    active_zones: number;
    total_at_home_bookings: number;
    total_revenue: number;
    total_travel_fees: number;
    average_booking_value: number;
  };
  period: {
    start_date: string | null;
    end_date: string | null;
  };
}

export default function ServiceZoneAnalyticsPage() {
  const { t } = useTranslation();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const localeTag = useTenantLocaleTag();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => format(subMonths(new Date(), 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    loadAnalytics();
    // Refetch whenever the date window changes so the table reflects the picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<{ data: AnalyticsData }>(
        `/api/provider/service-zones/analytics?start_date=${startDate}&end_date=${endDate}`
      );
      setAnalytics(response.data);
    } catch (err) {
      setAnalytics(null);
      setError(err instanceof Error ? err.message : t("web.provider.settings.pages.service-zones/analytics.couldNotLoadZoneAnalytics"));
      console.error("Error loading analytics:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(localeTag, {
      style: "currency",
      currency: tenantCurrency,
    }).format(amount);
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.service-zones/analytics.serviceZones"), href: "/provider/settings/service-zones" },
    { label: t("web.provider.settings.pages.service-zones/analytics.analytics") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.service-zones/analytics.loadingAnalytics")} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout breadcrumbs={breadcrumbs}>
      <PageHeader
        title={t("web.provider.settings.pages.service-zones/analytics.serviceZoneAnalytics")}
        subtitle={t("web.provider.settings.pages.service-zones/analytics.trackPerformanceAndBookingsByService")}
      />

      <div className="space-y-6">
        {/* Date Filter */}
        <SectionCard>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="start_date">{t("web.provider.common.startDate")}</Label>
              <Input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="end_date">{t("web.provider.common.endDate")}</Label>
              <Input
                id="end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button onClick={loadAnalytics} className="bg-primary hover:bg-primary-hover">
              <Calendar className="w-4 h-4 me-2" />
              {t("web.provider.common.applyFilter")}
            </Button>
          </div>
        </SectionCard>

        {error ? (
          <SectionCard>
            <EmptyReportState
              title={t("web.provider.settings.pages.service-zones/analytics.couldNotLoadZoneAnalytics")}
              description={error}
              action={{ label: t("web.provider.settings.pages.service-zones/analytics.tryAgain"), onClick: loadAnalytics }}
            />
          </SectionCard>
        ) : !analytics ? (
          <SectionCard>
            <EmptyReportState
              title={t("web.provider.settings.pages.service-zones/analytics.noAnalyticsData")}
              description={t("web.provider.settings.pages.service-zones/analytics.adjustDates")}
            />
          </SectionCard>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <SectionCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{t("web.provider.settings.pages.service-zones/analytics.totalZones")}</p>
                    <p className="text-2xl font-bold">{analytics.summary.total_zones}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {t("web.provider.settings.pages.service-zones/analytics.activeCount", { count: analytics.summary.active_zones })}
                    </p>
                  </div>
                  <MapPin className="w-8 h-8 text-primary" />
                </div>
              </SectionCard>

              <SectionCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{t("web.provider.settings.pages.service-zones/analytics.totalBookings")}</p>
                    <p className="text-2xl font-bold">{analytics.summary.total_at_home_bookings}</p>
                    <p className="text-xs text-gray-500 mt-1">{t("web.provider.settings.pages.service-zones/analytics.atHomeBookings")}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-blue-500" />
                </div>
              </SectionCard>

              <SectionCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{t("web.provider.settings.pages.service-zones/analytics.totalRevenue")}</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(analytics.summary.total_revenue)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {t("web.provider.settings.pages.service-zones/analytics.avg", { amount: formatCurrency(analytics.summary.average_booking_value) })}
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-green-500" />
                </div>
              </SectionCard>

              <SectionCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{t("web.provider.settings.pages.service-zones/analytics.travelFees")}</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(analytics.summary.total_travel_fees)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{t("web.provider.settings.pages.service-zones/analytics.totalCollected")}</p>
                  </div>
                  <MapPin className="w-8 h-8 text-orange-500" />
                </div>
              </SectionCard>
            </div>

            {/* Zone Details */}
            <SectionCard>
              <h3 className="text-lg font-semibold mb-4">{t("web.provider.settings.pages.service-zones/analytics.zonePerformance")}</h3>
              {analytics.zones.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
{t("web.provider.settings.pages.service-zones/analytics.noBookingsPeriod")}
                </p>
              ) : (
                <div className="space-y-4">
                  {analytics.zones.map((zone) => (
                    <div
                      key={zone.zone_id}
                      className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{zone.zone_name}</h4>
                            <Badge variant={zone.is_active ? "default" : "secondary"}>
                              {zone.is_active ? t("web.provider.common.active") : t("web.provider.common.inactive")}
                            </Badge>
                            <Badge variant="outline">{zone.zone_type}</Badge>
                          </div>
                        </div>
                        <div className="text-end">
                          <p className="text-lg font-bold text-primary">
                            {formatCurrency(zone.total_revenue)}
                          </p>
                          <p className="text-xs text-gray-500">{t("web.provider.settings.pages.service-zones/analytics.totalRevenue")}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-sm text-gray-600">{t("web.provider.settings.pages.service-zones/analytics.bookings")}</p>
                          <p className="text-lg font-semibold">{zone.total_bookings}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">{t("web.provider.settings.pages.service-zones/analytics.completed")}</p>
                          <p className="text-lg font-semibold text-green-600">
                            {zone.completed_bookings}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">{t("web.provider.settings.pages.service-zones/analytics.completionRate")}</p>
                          <p className="text-lg font-semibold">
                            {zone.completion_rate.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">{t("web.provider.settings.pages.service-zones/analytics.travelFees")}</p>
                          <p className="text-lg font-semibold">
                            {formatCurrency(zone.total_travel_fees)}
                          </p>
                        </div>
                      </div>

                      {zone.cancelled_bookings > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-red-600">
                            {t("web.provider.settings.pages.service-zones/analytics.cancelledCount", { count: zone.cancelled_bookings })}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
