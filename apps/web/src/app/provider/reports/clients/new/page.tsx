"use client";
import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, UserPlus, TrendingUp, DollarSign, CheckCircle } from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { subMonths, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";
import { getDefaultMoneyLocale } from "@beautonomi/utils";

interface NewClientsData {
  totalNewClients: number;
  returnedClients: number;
  returnRate: number;
  totalFirstBookingValue: number;
  averageFirstBookingValue: number;
  monthlyBreakdown: Array<{
    month: string;
    count: number;
  }>;
  newClients: Array<{
    customerId: string;
    clientName: string;
    email: string;
    firstVisit: string;
    firstBookingValue: number;
    hasReturned: boolean;
    totalBookings: number;
    totalSpent: number;
  }>;
}

export default function NewClientsReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subMonths(new Date(), 6),
    to: new Date(),
  });
  const [data, setData] = useState<NewClientsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

  useEffect(() => {
    loadReport();
  }, [dateRange, selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsSubscriptionRequired(false);

      const params = new URLSearchParams();
      appendReportDateParams(params, dateRange);
      appendLocation(params);

      const response = await fetcher.get<{ data: NewClientsData }>(
        `/api/provider/reports/clients/new?${params.toString()}`
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

  const handleReset = () => {
    setDateRange({
      from: subMonths(new Date(), 6),
      to: new Date(),
    });
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "new-clients", exportCurrency);
    exportToCSV(exportData, "new-clients-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.clients/new.title") },
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
          { label: t("web.provider.reports.pages.clients/new.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.clients/new.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.clients/new.title")} />
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
          { label: t("web.provider.reports.pages.clients/new.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.clients/new.unableToLoad")}
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
        { label: t("web.provider.reports.pages.clients/new.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.reports.pages.clients/new.title")}
          subtitle={t("web.provider.reports.pages.clients/new.subtitle")}
          actions={
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 me-2" />
              {t("web.provider.common.export")}
            </Button>
          }
        />

        <ReportFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={handleReset}
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.clients/new.totalNew")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.totalNewClients}</p>
                <UserPlus className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.clients/new.returned")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.returnedClients}</p>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.clients/new.returnRate")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.returnRate.toFixed(1)}%
                </p>
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.clients/new.avgFirstBooking")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {fmt(data.averageFirstBookingValue)}
                </p>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Breakdown */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>{t("web.provider.reports.pages.clients/new.byMonth")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.monthlyBreakdown.length === 0 ? (
              <EmptyReportState title={t("web.provider.reports.pages.clients/new.emptyTitle")} description={t("web.provider.reports.pages.clients/new.emptyDesc")} />
            ) : (
              <div className="space-y-3">
                {data.monthlyBreakdown.map((item) => {
                  const [year, month] = item.month.split("-");
                  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString(getDefaultMoneyLocale(), { month: "long", year: "numeric" });
                  return (
                    <div
                      key={item.month}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                    >
                      <p className="font-medium text-gray-900">{monthName}</p>
                      <p className="font-semibold text-gray-900">{t("web.provider.reports.pages.clients/new.newClientsCount", { count: item.count })}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent New Clients */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>{t("web.provider.reports.pages.clients/new.recent")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.newClients.length === 0 ? (
              <EmptyReportState title={t("web.provider.reports.pages.clients/new.emptyTitle")} description={t("web.provider.reports.pages.clients/new.emptyDesc")} />
            ) : (
              <div className="space-y-3">
                {data.newClients.map((client) => (
                  <div
                    key={client.customerId}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{client.clientName}</p>
                      <p className="text-sm text-gray-600">
                        {t("web.provider.reports.pages.clients/new.firstVisit", { date: format(new Date(client.firstVisit), "MMM dd, yyyy") })}
                      </p>
                      {client.hasReturned && (
                        <p className="text-xs text-green-600 mt-1">
                          {t("web.provider.reports.pages.clients/new.returnedVisits", { count: client.totalBookings })}
                        </p>
                      )}
                    </div>
                    <div className="text-end">
                      <p className="font-semibold text-gray-900">
                        {fmt(client.firstBookingValue)}
                      </p>
                      {client.totalSpent > client.firstBookingValue && (
                        <p className="text-sm text-gray-600">
                          {t("web.provider.reports.pages.clients/new.total", { amount: fmt(client.totalSpent) })}
                        </p>
                      )}
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
