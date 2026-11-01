"use client";
import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
import { useReportExportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Clock } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface StaffHoursData {
  reportBasis?: string;
  totalDeliveredHours: number;
  totalMissedHours: number;
  totalNotYetCompletedHours: number;
  totalCancelledHours: number;
  completionRate: number;
  staffHours: Array<{
    staffId: string;
    staffName: string;
    deliveredHours: number;
    missedHours: number;
    notYetCompletedHours: number;
    cancelledHours: number;
    deliveredBookings: number;
    missedBookings: number;
    completionRate: number;
  }>;
}

export default function StaffHoursReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const exportCurrency = useReportExportCurrency();
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<StaffHoursData | null>(null);
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

      const response = await fetcher.get<{ data: StaffHoursData }>(
        `/api/provider/reports/staff/hours?${params.toString()}`
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
      from: subDays(new Date(), 30),
      to: new Date(),
    });
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "staff-hours", exportCurrency);
    exportToCSV(exportData, "staff-hours-report");
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
    { label: t("web.provider.reports.pages.staff/hours.title") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <ReportSkeleton />
      </SettingsDetailLayout>
    );
  }

  if (isSubscriptionRequired) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.staff/hours.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.staff/hours.title")} />
        </div>
      </SettingsDetailLayout>
    );
  }

  if (error || !data) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.staff/hours.unableToLoad")}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout breadcrumbs={breadcrumbs} showCloseButton={false}>
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.reports.pages.staff/hours.title")}
          subtitle={t("web.provider.reports.pages.staff/hours.subtitle")}
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

        {data.reportBasis ? (
          <p className="text-sm text-gray-600">{data.reportBasis}</p>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.staff/hours.deliveredHours")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">
                {t("web.provider.reports.pages.staff/hours.hoursValue", {
                  hours: data.totalDeliveredHours.toFixed(1),
                })}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.staff/hours.missedHours")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">
                {t("web.provider.reports.pages.staff/hours.hoursValue", {
                  hours: data.totalMissedHours.toFixed(1),
                })}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.staff/hours.stillOnBookHours")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">
                {t("web.provider.reports.pages.staff/hours.hoursValue", {
                  hours: data.totalNotYetCompletedHours.toFixed(1),
                })}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.staff/hours.cancelledHours")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-gray-900">
                {t("web.provider.reports.pages.staff/hours.hoursValue", {
                  hours: data.totalCancelledHours.toFixed(1),
                })}
              </p>
            </CardContent>
          </Card>
        </div>

        <p className="text-sm text-gray-700">
          {t("web.provider.reports.pages.staff/hours.completionRateLine", {
            pct: data.completionRate.toFixed(0),
          })}
        </p>

        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>{t("web.provider.reports.pages.staff/hours.breakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.staffHours.length === 0 ? (
              <EmptyReportState
                title={t("web.provider.reports.pages.staff/hours.emptyTitle")}
                description={t("web.provider.reports.pages.staff/hours.emptyDesc")}
              />
            ) : (
              <div className="space-y-3">
                {data.staffHours.map((staff) => (
                  <div
                    key={staff.staffId}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <Clock className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{staff.staffName}</p>
                        <p className="text-sm text-gray-600">
                          {t("web.provider.reports.pages.staff/hours.staffBuckets", {
                            delivered: staff.deliveredHours.toFixed(1),
                            missed: staff.missedHours.toFixed(1),
                            still: staff.notYetCompletedHours.toFixed(1),
                            cancelled: staff.cancelledHours.toFixed(1),
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-end text-sm text-gray-700">
                      {t("web.provider.reports.pages.staff/hours.staffCompletionRate", {
                        pct: staff.completionRate.toFixed(0),
                      })}
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
