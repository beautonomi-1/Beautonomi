"use client";

import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import Link from "next/link";

type YocoRow = {
  id: string;
  yoco_payment_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  appointment_id?: string | null;
  sale_id?: string | null;
  created_at?: string | null;
};

type PaycloudRow = {
  id: string;
  merchant_order_no?: string | null;
  amount?: number | null;
  expected_amount?: number | null;
  amount_match_status?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type AwaitingRefundRow = {
  id: string;
  booking_id: string;
  booking_ref?: string | null;
  amount: number;
  reason?: string | null;
  provider: string;
  since?: string | null;
};

type CardMachineReconciliationData = {
  yoco: YocoRow[];
  paycloud: PaycloudRow[];
  awaiting_refunds?: AwaitingRefundRow[];
  summary: {
    total: number;
    exceptions: number;
    yoco_pending?: number;
    paycloud_amount_mismatch?: number;
    awaiting_refunds?: number;
    awaiting_refund_total?: number;
  };
};

export default function CardMachineReconciliationPage() {
  const { t } = useTranslation();
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const { format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<CardMachineReconciliationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

  const reportEnabled = yocoEnabled || paycloudEnabled;

  const title = t("web.provider.reports.pages.payments/card-machine-reconciliation.title");
  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
    { label: t("web.provider.reports.hub.paymentsTitle"), href: "/provider/reports/payments/summary" },
    { label: title },
  ];

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsSubscriptionRequired(false);
      const params = new URLSearchParams();
      appendReportDateParams(params, dateRange);
      const response = await fetcher.get<{ data: CardMachineReconciliationData }>(
        `/api/provider/reports/payments/card-machine-reconciliation?${params.toString()}`,
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
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!reportEnabled) return;
    void loadReport();
  }, [dateRange, reportEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!reportEnabled) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <PageHeader title={title} subtitle={t("web.provider.reports.pages.payments/card-machine-reconciliation.unavailableDesc")} />
      </SettingsDetailLayout>
    );
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
        <PageHeader title={title} />
        <ReportSubscriptionRequired feature={title} />
      </SettingsDetailLayout>
    );
  }

  if (error || !data) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <EmptyReportState
          title={t("web.provider.reports.pages.payments/card-machine-reconciliation.unableToLoad")}
          description={error ?? ""}
          action={{
            label: t("common.refresh"),
            onClick: () => void loadReport(),
          }}
        />
      </SettingsDetailLayout>
    );
  }

  const yocoExceptions = data.yoco.filter((r) => r.status === "pending");
  const paycloudExceptions = data.paycloud.filter(
    (r) =>
      r.amount_match_status &&
      r.amount_match_status !== "exact" &&
      r.amount_match_status !== "pending",
  );
  const awaitingRefunds = data.awaiting_refunds ?? [];
  const rk = (key: string, opts?: Record<string, unknown>) =>
    t(`web.provider.reports.pages.payments/card-machine-reconciliation.${key}`, opts);

  return (
    <SettingsDetailLayout breadcrumbs={breadcrumbs}>
      <div className="space-y-6">
        <PageHeader
          title={title}
          subtitle={t("web.provider.reports.pages.payments/card-machine-reconciliation.subtitle")}
          actions={
            <Button variant="outline" size="sm" onClick={() => void loadReport()}>
              <RefreshCw className="h-4 w-4 me-2" />
              {t("common.refresh")}
            </Button>
          }
        />
        <ReportFilters dateRange={dateRange} onDateRangeChange={setDateRange} onReset={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.payments/card-machine-reconciliation.totalRows")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data.summary.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.payments/card-machine-reconciliation.yocoPending")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data.summary.yoco_pending ?? yocoExceptions.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {t("web.provider.reports.pages.payments/card-machine-reconciliation.paycloudMismatch")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data.summary.paycloud_amount_mismatch ?? paycloudExceptions.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{rk("awaitingRefunds")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{awaitingRefunds.length}</p>
              {awaitingRefunds.length > 0 ? (
                <p className="text-xs text-amber-700 mt-1">
                  {fmt(data.summary.awaiting_refund_total ?? 0)}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {data.summary.exceptions === 0 ? (
          <EmptyReportState
            title={t("web.provider.reports.pages.payments/card-machine-reconciliation.emptyTitle")}
            description={t("web.provider.reports.pages.payments/card-machine-reconciliation.emptyDesc")}
          />
        ) : (
          <div className="space-y-6">
            {awaitingRefunds.length > 0 ? (
              <Card className="border-amber-200">
                <CardHeader>
                  <CardTitle>{rk("awaitingRefundsSection")}</CardTitle>
                  <p className="text-sm text-gray-600">{rk("awaitingRefundsHint")}</p>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-start text-gray-500">
                        <th className="py-2 pe-4">{rk("awaitingSince")}</th>
                        <th className="py-2 pe-4">{rk("amount")}</th>
                        <th className="py-2 pe-4">{rk("booking")}</th>
                        <th className="py-2 pe-4">{rk("reason")}</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {awaitingRefunds.map((row) => (
                        <tr key={row.id} className="border-b border-gray-100">
                          <td className="py-2 pe-4">{row.since ? format(new Date(row.since), "PP p") : "—"}</td>
                          <td className="py-2 pe-4 font-medium">{fmt(row.amount)}</td>
                          <td className="py-2 pe-4">{row.booking_ref ?? row.booking_id.slice(0, 8)}</td>
                          <td className="py-2 pe-4">{row.reason ?? "—"}</td>
                          <td className="py-2">
                            <Link
                              href={`/provider/bookings/${row.booking_id}`}
                              className="text-[#FF0077] font-medium hover:underline"
                            >
                              {rk("openBooking")}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ) : null}
            {yocoExceptions.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t("web.provider.reports.pages.payments/card-machine-reconciliation.yocoSection")}</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-start text-gray-500">
                        <th className="py-2 pe-4">{t("web.provider.reports.pages.payments/card-machine-reconciliation.created")}</th>
                        <th className="py-2 pe-4">{t("web.provider.reports.pages.payments/card-machine-reconciliation.amount")}</th>
                        <th className="py-2 pe-4">{t("web.provider.reports.pages.payments/card-machine-reconciliation.status")}</th>
                        <th className="py-2">{t("web.provider.reports.pages.payments/card-machine-reconciliation.link")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yocoExceptions.map((row) => (
                        <tr key={row.id} className="border-b border-gray-100">
                          <td className="py-2 pe-4">{row.created_at ? format(new Date(row.created_at), "PP p") : "—"}</td>
                          <td className="py-2 pe-4">{fmt(Number(row.amount ?? 0) / 100)}</td>
                          <td className="py-2 pe-4">{row.status ?? "—"}</td>
                          <td className="py-2">{row.appointment_id ?? row.sale_id ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ) : null}
            {paycloudExceptions.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t("web.provider.reports.pages.payments/card-machine-reconciliation.paycloudSection")}</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-start text-gray-500">
                        <th className="py-2 pe-4">{t("web.provider.reports.pages.payments/card-machine-reconciliation.created")}</th>
                        <th className="py-2 pe-4">{t("web.provider.reports.pages.payments/card-machine-reconciliation.amount")}</th>
                        <th className="py-2 pe-4">{t("web.provider.reports.pages.payments/card-machine-reconciliation.match")}</th>
                        <th className="py-2">{t("web.provider.reports.pages.payments/card-machine-reconciliation.order")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paycloudExceptions.map((row) => (
                        <tr key={row.id} className="border-b border-gray-100">
                          <td className="py-2 pe-4">{row.created_at ? format(new Date(row.created_at), "PP p") : "—"}</td>
                          <td className="py-2 pe-4">{fmt(Number(row.amount ?? 0))}</td>
                          <td className="py-2 pe-4">{row.amount_match_status ?? "—"}</td>
                          <td className="py-2">{row.merchant_order_no ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
