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
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
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
  booking_id?: string | null;
  sale_id?: string | null;
  group_booking_id?: string | null;
  product_order_id?: string | null;
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
  reportBasis?: string;
  summary: {
    yoco_payments_in_window?: number;
    paycloud_payments_in_window?: number;
    yoco_pending?: number;
    paycloud_amount_mismatch?: number;
    payment_exceptions?: number;
    awaiting_refunds?: number;
    awaiting_refund_total?: number;
  };
};

function PaycloudLinkCell({ row, openBookingLabel }: { row: PaycloudRow; openBookingLabel: string }) {
  if (row.booking_id) {
    return (
      <Link href={`/provider/bookings/${row.booking_id}`} className="text-[#FF0077] font-medium hover:underline">
        {openBookingLabel}
      </Link>
    );
  }
  if (row.sale_id) {
    return (
      <Link href={`/provider/sales/${row.sale_id}`} className="text-[#FF0077] font-medium hover:underline">
        Sale
      </Link>
    );
  }
  if (row.group_booking_id) {
    return (
      <Link
        href={`/provider/group-bookings/${row.group_booking_id}`}
        className="text-[#FF0077] font-medium hover:underline"
      >
        Group booking
      </Link>
    );
  }
  if (row.product_order_id) {
    return (
      <Link
        href={`/provider/product-orders/${row.product_order_id}`}
        className="text-[#FF0077] font-medium hover:underline"
      >
        Product order
      </Link>
    );
  }
  return <span>{row.merchant_order_no ?? "—"}</span>;
}

export default function CardMachineReconciliationPage() {
  const { t } = useTranslation();
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const { format: fmt } = useReportCurrency();
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
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
      appendLocation(params);
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
  }, [dateRange, reportEnabled, selectedLocationId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const yocoExceptions = data.yoco;
  const paycloudExceptions = data.paycloud;
  const awaitingRefunds = data.awaiting_refunds ?? [];
  const paymentExceptions = data.summary.payment_exceptions ?? yocoExceptions.length + paycloudExceptions.length;
  const yocoInWindow = data.summary.yoco_payments_in_window ?? 0;
  const paycloudInWindow = data.summary.paycloud_payments_in_window ?? 0;
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

        {data.reportBasis ? <p className="text-sm text-gray-600">{data.reportBasis}</p> : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{rk("yocoPaymentsInWindow")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{yocoInWindow}</p>
              <p className="text-xs text-gray-600 mt-1">
                {rk("yocoPending")}: {data.summary.yoco_pending ?? yocoExceptions.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{rk("paycloudPaymentsInWindow")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{paycloudInWindow}</p>
              <p className="text-xs text-gray-600 mt-1">
                {rk("paycloudMismatch")}: {data.summary.paycloud_amount_mismatch ?? paycloudExceptions.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{rk("awaitingRefunds")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{awaitingRefunds.length}</p>
              {awaitingRefunds.length > 0 ? (
                <p className="text-xs text-amber-700 mt-1">{fmt(data.summary.awaiting_refund_total ?? 0)}</p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {paymentExceptions === 0 ? (
          <p className="text-sm text-gray-700 rounded-lg border border-emerald-100 bg-emerald-50/80 px-4 py-3">
            {rk("allMatchedLine", { yoco: yocoInWindow, paycloud: paycloudInWindow })}
          </p>
        ) : null}

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
                          <Link href={`/provider/bookings/${row.booking_id}`} className="text-[#FF0077] font-medium hover:underline">
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
                <CardTitle>{rk("yocoSection")}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-start text-gray-500">
                      <th className="py-2 pe-4">{rk("created")}</th>
                      <th className="py-2 pe-4">{rk("amount")}</th>
                      <th className="py-2 pe-4">{rk("status")}</th>
                      <th className="py-2">{rk("link")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yocoExceptions.map((row) => (
                      <tr key={row.id} className="border-b border-gray-100">
                        <td className="py-2 pe-4">{row.created_at ? format(new Date(row.created_at), "PP p") : "—"}</td>
                        <td className="py-2 pe-4">{fmt(Number(row.amount ?? 0) / 100)}</td>
                        <td className="py-2 pe-4">{row.status ?? "—"}</td>
                        <td className="py-2">
                          {row.appointment_id ? (
                            <Link href={`/provider/bookings/${row.appointment_id}`} className="text-[#FF0077] font-medium hover:underline">
                              {rk("openBooking")}
                            </Link>
                          ) : row.sale_id ? (
                            <Link href={`/provider/sales/${row.sale_id}`} className="text-[#FF0077] font-medium hover:underline">
                              Sale
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
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
                <CardTitle>{rk("paycloudSection")}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-start text-gray-500">
                      <th className="py-2 pe-4">{rk("created")}</th>
                      <th className="py-2 pe-4">{rk("amount")}</th>
                      <th className="py-2 pe-4">{rk("match")}</th>
                      <th className="py-2">{rk("link")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paycloudExceptions.map((row) => (
                      <tr key={row.id} className="border-b border-gray-100">
                        <td className="py-2 pe-4">{row.created_at ? format(new Date(row.created_at), "PP p") : "—"}</td>
                        <td className="py-2 pe-4">{fmt(Number(row.amount ?? 0))}</td>
                        <td className="py-2 pe-4">{row.amount_match_status ?? "—"}</td>
                        <td className="py-2">
                          <PaycloudLinkCell row={row} openBookingLabel={rk("openBooking")} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </SettingsDetailLayout>
  );
}
