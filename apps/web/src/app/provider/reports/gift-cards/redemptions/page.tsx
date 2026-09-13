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
import { Download, Gift, DollarSign, TrendingUp } from "lucide-react";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, formatReportDataForExport, type ReportRow } from "../../utils/export";

interface GiftCardRedemptionsData {
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  reportBasis?: string;
  basis?: Record<string, string>;
  totalRedemptions: number;
  totalRedeemedValue: number;
  averageRedemptionValue: number;
  redemptionRateNote?: string;
  redemptions: Array<{
    id: string;
    amount: number;
    captured_at?: string;
    redeemed_at?: string;
  }>;
}

export default function GiftCardRedemptionsReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<GiftCardRedemptionsData | null>(null);
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

      const response = await fetcher.get<{ data: GiftCardRedemptionsData }>(
        `/api/provider/reports/gift-cards/redemptions?${params.toString()}`,
        { timeoutMs: 120_000 },
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
    const exportData = formatReportDataForExport(data as unknown as ReportRow, "gift-card-redemptions", exportCurrency);
    exportToCSV(exportData, "gift-card-redemptions-detail-report");
  };

  const captureTime = (r: GiftCardRedemptionsData["redemptions"][0]) =>
    r.redeemed_at ?? r.captured_at ?? "";

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.gift-cards/redemptions.title") },
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
          { label: t("web.provider.reports.pages.gift-cards/redemptions.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader title={t("web.provider.reports.pages.gift-cards/redemptions.title")} />
          <ReportSubscriptionRequired feature={t("web.provider.reports.pages.gift-cards/redemptions.title")} />
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
          { label: t("web.provider.reports.pages.gift-cards/redemptions.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.gift-cards/redemptions.unableToLoad")}
        />
      </SettingsDetailLayout>
    );
  }

  const basisEntries = data.basis
    ? (Object.entries(data.basis) as [string, string][]).filter(([, v]) => v?.trim())
    : [];

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.reports.pages.gift-cards/redemptions.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.reports.pages.gift-cards/redemptions.pageTitle")}
          subtitle={t("web.provider.reports.pages.gift-cards/redemptions.subtitle")}
          actions={
            <Button variant="outline" onClick={handleExport} className="gap-2 min-h-[44px] touch-manipulation">
              <Download className="w-4 h-4" />
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
          <div className="rounded-xl border border-sky-100 bg-sky-50/90 px-4 py-3 text-sm leading-relaxed text-sky-950">
            <p className="font-medium text-sky-950">{t("web.provider.reports.common.whatThisReportCounts")}</p>
            <p className="mt-1 text-sky-950/95">{data.reportBasis}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sky-900/85">
              {data.timezone ? <span>{t("web.provider.reports.common.timezoneDot", { tz: data.timezone })}</span> : null}
              {data.fromYmd && data.toYmd ? (
                <span>
                  {t("web.provider.reports.pages.gift-cards/redemptions.window", { from: data.fromYmd, to: data.toYmd })}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {basisEntries.length > 0 ? (
          <Card className="border-violet-100 bg-violet-50/40 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-violet-950">{t("web.provider.reports.common.definitions")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-violet-950/95">
              {basisEntries.map(([k, v]) => (
                <p key={k}>
                  <span className="font-medium">{t(`web.provider.reports.pages.gift-cards/redemptions.${k}`)} · </span>
                  {v}
                </p>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.gift-cards/redemptions.redemptionRows")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{data.totalRedemptions}</p>
                <Gift className="h-5 w-5 shrink-0 text-pink-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.gift-cards/redemptions.redeemedValue")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.totalRedeemedValue)}</p>
                <DollarSign className="h-5 w-5 shrink-0 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.gift-cards/redemptions.avgPerRow")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.averageRedemptionValue)}</p>
                <TrendingUp className="h-5 w-5 shrink-0 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {data.redemptionRateNote ? (
          <p className="text-sm text-gray-600 leading-relaxed">{data.redemptionRateNote}</p>
        ) : null}

        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>{t("web.provider.reports.pages.gift-cards/redemptions.recentCaptures")}</CardTitle>
            <p className="text-sm font-normal text-gray-500 mt-1">
              {t("web.provider.reports.pages.gift-cards/redemptions.timestampsHint")}
            </p>
          </CardHeader>
          <CardContent>
            {data.redemptions.length === 0 ? (
              <EmptyReportState title={t("web.provider.reports.pages.gift-cards/redemptions.emptyTitle")} description={t("web.provider.reports.pages.gift-cards/redemptions.emptyDesc")} />
            ) : (
              <div className="space-y-2">
                {data.redemptions.map((redemption) => {
                  const captured = captureTime(redemption);
                  const safe = captured ? format(new Date(captured), "MMM dd, yyyy 'at' h:mm a") : t("web.provider.common.emDash");
                  return (
                    <div
                      key={redemption.id}
                      className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-gray-100/80"
                    >
                      <p className="text-sm text-gray-900">{safe}</p>
                      <p className="font-semibold tabular-nums text-gray-900">{fmt(Number(redemption.amount || 0))}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
