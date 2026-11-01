"use client";

import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../components/ReportSkeleton";
import { EmptyReportState } from "../components/EmptyReportState";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../utils/export";

type MembershipData = {
  reportBasis?: string;
  gross_sales: number;
  recognized_earnings: number;
  member_discounts_applied: number;
  active_subscribers: number;
  sales_count?: number;
  sales_by_day?: { date: string; gross: number; count: number }[];
};

export default function MembershipSalesReportPage() {
  const { t } = useTranslation();
  const mr = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.membershipReport.${key}`, opts) as string;
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<MembershipData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

  const title = mr("title");
  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
    { label: title },
  ];

  useEffect(() => {
    void loadReport();
  }, [dateRange]);

  async function loadReport() {
    try {
      setIsLoading(true);
      setError(null);
      setIsSubscriptionRequired(false);
      const params = new URLSearchParams();
      appendReportDateParams(params, dateRange);
      const response = await fetcher.get<{ data: MembershipData }>(
        `/api/provider/reports/memberships?${params.toString()}`,
      );
      setData(response.data);
    } catch (err) {
      const parsed = parseReportLoadError(err);
      if (parsed.subscriptionRequired) {
        setIsSubscriptionRequired(true);
      } else {
        setError(parsed.message);
      }
    } finally {
      setIsLoading(false);
    }
  }

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
        <ReportSubscriptionRequired feature={title} />
      </SettingsDetailLayout>
    );
  }

  if (error || !data) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <EmptyReportState title={t("web.provider.common.failedToLoadReport")} description={error ?? ""} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout breadcrumbs={breadcrumbs}>
      <div className="space-y-6">
        <PageHeader
          title={title}
          subtitle={mr("subtitle")}
          actions={
            <Button
              variant="outline"
              onClick={() =>
                exportToCSV(
                  formatReportDataForExport(data as unknown as ReportRow, "membership-sales", exportCurrency),
                  "membership-sales",
                )
              }
            >
              <Download className="w-4 h-4 me-2" />
              {t("web.provider.common.export")}
            </Button>
          }
        />
        <ReportFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}
        />
        {data.reportBasis ? <p className="text-sm text-gray-600">{data.reportBasis}</p> : null}
        <p className="text-sm text-gray-700">
          {mr("separateBases")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{mr("grossSales")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{fmt(data.gross_sales)}</p>
              <p className="text-xs text-gray-600 mt-1">{mr("salesCount", { count: data.sales_count ?? 0 })}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{mr("recognizedEarnings")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{fmt(data.recognized_earnings)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{mr("memberDiscounts")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{fmt(data.member_discounts_applied)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{mr("activeSubscribers")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data.active_subscribers}</p>
              <p className="text-xs text-gray-600 mt-1">{mr("activeStatusHint")}</p>
            </CardContent>
          </Card>
        </div>
        {(data.sales_by_day?.length ?? 0) > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{mr("salesByDay")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.sales_by_day!.map((row) => (
                <div key={row.date} className="flex justify-between text-sm border-b border-gray-100 py-2">
                  <span className="text-gray-600">{row.date}</span>
                  <span className="font-medium">{mr("dayGross", { amount: fmt(row.gross), count: row.count })}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </SettingsDetailLayout>
  );
}
