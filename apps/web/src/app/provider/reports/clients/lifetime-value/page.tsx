"use client";
import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, DollarSign, Users, TrendingUp } from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { addLocationIdToUrl } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface LifetimeValueData {
  totalClients: number;
  averageLTV: number;
  medianLTV: number;
  totalLTV: number;
  averageVisits: number;
  highValueClients: number;
  mediumValueClients: number;
  lowValueClients: number;
  topClients: Array<{
    customerId: string;
    clientName: string;
    email: string;
    totalSpent: number;
    totalBookings: number;
    averageBookingValue: number;
    daysSinceFirstVisit: number;
    visitsPerMonth: number;
  }>;
  ltvSegments: Array<{
    segment: string;
    count: number;
    avgLTV: number;
  }>;
}

export default function LifetimeValueReport() {
  const { selectedLocationId } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const { t } = useTranslation();
  const [data, setData] = useState<LifetimeValueData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

  useEffect(() => {
    loadReport();
  }, [selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsSubscriptionRequired(false);

      const response = await fetcher.get<{ data: LifetimeValueData }>(
        addLocationIdToUrl("/api/provider/reports/clients/lifetime-value", selectedLocationId)
      );
      setData(response.data);
    } catch (err) {
      const parsed = parseReportLoadError(err);
      if (parsed.subscriptionRequired) {
        setIsSubscriptionRequired(true);
        setError(null);
      } else {
        setError(parsed.message);
        setIsSubscriptionRequired(false);
      }
      console.error("Error loading report:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "lifetime-value", exportCurrency);
    exportToCSV(exportData, "lifetime-value-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.clients/lifetime-value.title") },
        ]}
      >
        <ReportSkeleton />
      </SettingsDetailLayout>
    );
  }

  if (isSubscriptionRequired) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.clients/lifetime-value.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.clients/lifetime-value.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.clients/lifetime-value.title")} />
        </div>
      </SettingsDetailLayout>
    );
  }

  if (error || !data) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.clients/lifetime-value.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.clients/lifetime-value.unableToLoad")}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.reports.pages.clients/lifetime-value.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.reports.pages.clients/lifetime-value.title")}
          subtitle={t("web.provider.reports.pages.clients/lifetime-value.subtitle")}
          actions={
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 me-2" />
              {t("web.provider.common.export")}
            </Button>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.clients/lifetime-value.averageLtv")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {fmt(data.averageLTV)}
                </p>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.clients/lifetime-value.medianLtv")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {fmt(data.medianLTV)}
                </p>
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.clients/lifetime-value.totalLtv")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {fmt(data.totalLTV)}
                </p>
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.clients/lifetime-value.avgVisits")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.averageVisits.toFixed(1)}
                </p>
                <Users className="w-5 h-5 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* LTV Segments */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>{t("web.provider.reports.pages.clients/lifetime-value.segments")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.ltvSegments.map((segment) => (
                <div
                  key={segment.segment}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                >
                  <div>
                    <p className="font-medium text-gray-900">{segment.segment}</p>
                    <p className="text-sm text-gray-600">{t("web.provider.reports.pages.clients/lifetime-value.clientsCount", { count: segment.count })}</p>
                  </div>
                  <p className="font-semibold text-gray-900">
                    {t("web.provider.reports.pages.clients/lifetime-value.avg", { amount: fmt(segment.avgLTV) })}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Clients */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>{t("web.provider.reports.pages.clients/lifetime-value.topClients")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topClients.length === 0 ? (
              <EmptyReportState title={t("web.provider.reports.pages.clients/lifetime-value.emptyTitle")} description={t("web.provider.reports.pages.clients/lifetime-value.emptyDesc")} />
            ) : (
              <div className="space-y-3">
                {data.topClients.map((client, index) => (
                  <div
                    key={client.customerId}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white font-semibold text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{client.clientName}</p>
                        <p className="text-sm text-gray-600">
                          {t("web.provider.reports.pages.clients/lifetime-value.visitsMonths", { visits: client.totalBookings, months: Math.floor(client.daysSinceFirstVisit / 30) })}
                        </p>
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="font-semibold text-gray-900">
                        {fmt(client.totalSpent)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {t("web.provider.reports.pages.clients/lifetime-value.avg", { amount: fmt(client.averageBookingValue) })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
