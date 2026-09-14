"use client";
import { useTranslation } from "@beautonomi/i18n";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, CreditCard, ShoppingBag, Calendar, Download, HeartHandshake, Ban, Info, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { formatBookingTimeInTimeZone } from "@/lib/bookings/display-datetime";
import { fetcher , FetchError } from "@/lib/http/fetcher";
import { format } from "date-fns";
import { ReportSkeleton } from "../components/ReportSkeleton";
import { EmptyReportState } from "../components/EmptyReportState";
import type { EndOfDayResponse } from "@/app/api/provider/reports/end-of-day/route";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { exportToCSV, exportToPDF, formatReportDataForExport, type ReportRow } from "../utils/export";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RECORDED_TAKINGS_PAYMENT_METHODS } from "@/lib/reports/recorded-takings";

type CloseOutBooking = {
  id: string;
  booking_number?: string | null;
  scheduled_at: string;
  status: string;
  customer?: { full_name?: string | null } | null;
  booking_services?: Array<{ offering?: { title?: string | null } | null }> | null;
};

type CloseOutResponse = {
  summary: { total: number; today: number; older: number };
  bookings: CloseOutBooking[];
};

function paymentLabels(t: (k: string) => string): Record<string, string> {
  return {
    cash: t("web.provider.reports.pages.end-of-day.cash"),
    card: t("web.provider.reports.pages.end-of-day.card"),
    bank_transfer: t("web.provider.reports.pages.end-of-day.bankTransfer"),
    paystack: t("web.provider.reports.pages.end-of-day.paystack"),
    paystack_terminal: t("web.provider.reports.pages.end-of-day.paystackTerminal"),
    yoco: t("web.provider.sidebar.items.yoco"),
    paycloud: t("web.provider.reports.pages.end-of-day.cardMachine"),
    gift_card: t("web.provider.reports.pages.end-of-day.giftCard"),
    wallet: t("web.provider.reports.pages.end-of-day.wallet"),
    other: t("web.provider.common.other"),
  };
}

export default function EndOfDayReportPage() {
  const { t } = useTranslation();
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const [data, setData] = useState<EndOfDayResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);
  const [subscriptionGateMessage, setSubscriptionGateMessage] = useState<string | null>(null);
  const [closeOutQueue, setCloseOutQueue] = useState<CloseOutResponse | null>(null);
  const [closeOutLoading, setCloseOutLoading] = useState(false);

  useEffect(() => {
    loadReport();
  }, [date, selectedLocationId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        appendLocation(params);
        const qs = params.toString();
        const res = await fetcher.get<{ data: CloseOutResponse }>(
          `/api/provider/bookings/close-out${qs ? `?${qs}` : ""}`,
        );
        if (!cancelled) setCloseOutQueue(res.data ?? null);
      } catch {
        if (!cancelled) setCloseOutQueue(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedLocationId, appendLocation]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setIsSubscriptionRequired(false);
      setSubscriptionGateMessage(null);
      const params = new URLSearchParams({ date });
      appendLocation(params);
      const response = await fetcher.get<{ data: EndOfDayResponse }>(
        `/api/provider/reports/end-of-day?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      const parsed = parseReportLoadError(err);
      if (parsed.subscriptionRequired) {
        setIsSubscriptionRequired(true);
        setSubscriptionGateMessage(parsed.message);
        setError(null);
      } else {
        setError(parsed.message);
        setIsSubscriptionRequired(false);
        setSubscriptionGateMessage(null);
      }
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkCompleteCloseOut = async () => {
    const eligible = (closeOutQueue?.bookings ?? []).filter((b) =>
      ["in_progress", "checked_in"].includes(String(b.status)),
    );
    if (eligible.length === 0) {
      return;
    }
    setCloseOutLoading(true);
    try {
      await fetcher.post("/api/provider/bookings/close-out/bulk-complete", {
        booking_ids: eligible.map((b) => b.id),
      });
      const params = new URLSearchParams();
      appendLocation(params);
      const qs = params.toString();
      const res = await fetcher.get<{ data: CloseOutResponse }>(
        `/api/provider/bookings/close-out${qs ? `?${qs}` : ""}`,
      );
      setCloseOutQueue(res.data ?? null);
    } finally {
      setCloseOutLoading(false);
    }
  };

  const handleExport = (fmt: "csv" | "pdf" = "csv") => {
    if (!data) return;
    if (fmt === "csv") {
      const rows = formatReportDataForExport(data as unknown as ReportRow, "end-of-day", exportCurrency);
      exportToCSV(rows, "end-of-day-report");
    } else {
      exportToPDF("end-of-day-report", "end-of-day-report", t("web.provider.reports.pages.end-of-day.reportTitle"));
    }
  };

  if (isLoading && !data) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.end-of-day.title") },
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
          { label: t("web.provider.reports.pages.end-of-day.title") },
        ]}
      >
        <ReportSubscriptionRequired feature={t("web.provider.reports.pages.end-of-day.title")} message={subscriptionGateMessage} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.reports.pages.end-of-day.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.reports.pages.end-of-day.title")}
          subtitle={t("web.provider.reports.pages.end-of-day.subtitle")}
        />

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="eod-date" className="text-sm font-medium text-gray-700">{t("web.provider.common.date")}</Label>
            <Input
              id="eod-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-[180px] rounded-xl border border-gray-200 bg-white shadow-sm"
            />
          </div>
          <Button onClick={loadReport} disabled={isLoading} className="rounded-xl">
            {isLoading ? t("web.provider.reports.common.loading") : t("web.provider.reports.common.update")}
          </Button>
          {data && !error && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => handleExport("csv")}>
                <Download className="h-4 w-4 me-1" />
{t("web.provider.common.csv")}
              </Button>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => handleExport("pdf")}>
{t("web.provider.reports.common.printPdf")}
              </Button>
            </div>
          )}
        </div>

        {error && (
          <EmptyReportState
title={t("web.provider.common.failedToLoadReport")}
            description={error}
          />
        )}

        {data && !error && (
          <div id="end-of-day-report" className="space-y-6">
            <Alert className="border-sky-200 bg-sky-50 text-sky-950">
              <Info className="h-4 w-4 text-sky-800" />
              <div>
                <AlertTitle className="text-sky-950">{t("web.provider.reports.common.whatThisReportCounts")}</AlertTitle>
                <AlertDescription className="text-sky-950/90 space-y-2 text-sm leading-relaxed">
                  <p>{data.reportBasis}</p>
                  {data.timezone ? (
                    <p className="text-xs text-sky-900/85">{t("web.provider.reports.pages.end-of-day.calendarDay", { date: data.date, timezone: data.timezone })}</p>
                  ) : null}
                </AlertDescription>
              </div>
            </Alert>

            {(closeOutQueue?.summary.total ?? 0) > 0 ? (
              <Card className="rounded-xl border-amber-200 bg-amber-50/60 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-amber-950 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
{t("web.provider.reports.pages.end-of-day.unclosed", { count: closeOutQueue?.summary.total ?? 0 })}
                  </CardTitle>
                  <p className="text-xs text-amber-900/85 mt-1">
{t("web.provider.reports.pages.end-of-day.unclosedSplit", { today: closeOutQueue?.summary.today ?? 0, older: closeOutQueue?.summary.older ?? 0 })}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="divide-y rounded-lg border border-amber-200/80 bg-white overflow-hidden">
                    {(closeOutQueue?.bookings ?? []).slice(0, 8).map((row) => {
const name = row.customer?.full_name?.trim() || t("web.provider.common.customer");
                      const service =
row.booking_services?.[0]?.offering?.title?.trim() || t("web.provider.common.appointment");
                      return (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{name}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {service} · {formatBookingTimeInTimeZone(row.scheduled_at)} ·{" "}
                              {row.status.replace(/_/g, " ")}
                            </p>
                          </div>
                          <Link
                            href={`/provider/bookings/${row.id}`}
                            className="shrink-0 text-xs font-medium text-amber-900 hover:underline"
                          >
{t("web.provider.common.open")}
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                  {(closeOutQueue?.bookings.length ?? 0) > 8 ? (
                    <p className="text-xs text-amber-800">
{t("web.provider.reports.pages.end-of-day.moreInQueue", { count: (closeOutQueue?.bookings.length ?? 0) - 8 })}
                    </p>
                  ) : null}
                  {(closeOutQueue?.bookings ?? []).some((b) =>
                    ["in_progress", "checked_in"].includes(String(b.status)),
                  ) ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl border-amber-300 text-amber-950 hover:bg-amber-100"
                      disabled={closeOutLoading}
                      onClick={() => void handleBulkCompleteCloseOut()}
                    >
                      {closeOutLoading ? t("web.provider.reports.pages.end-of-day.completing") : t("web.provider.reports.pages.end-of-day.completeAll")}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            <Card className="rounded-2xl border-indigo-200 bg-gradient-to-br from-indigo-50 to-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-indigo-900 flex items-center gap-2">
                  <Banknote className="w-5 h-5" />
{t("web.provider.reports.pages.end-of-day.totalTakings")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-semibold tracking-tight text-indigo-950 tabular-nums">
                  {fmt(data.total)}
                </p>
                <p className="mt-2 text-sm text-indigo-900/85">
{t("web.provider.reports.pages.end-of-day.totalTakingsHint")}
                </p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-emerald-600" />
{t("web.provider.reports.pages.sales/summary.bookingPayments")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.bookingPaymentsTotal)}</p>
                  <p className="text-xs text-gray-500 mt-2">
{t("web.provider.reports.pages.end-of-day.bookingPaymentsHint")}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-violet-600" />
{t("web.provider.reports.pages.end-of-day.walletExtra")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.walletTotal)}</p>
                  <p className="text-xs text-gray-500 mt-2">
{t("web.provider.reports.pages.end-of-day.walletHint")}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-amber-600" />
{t("web.provider.reports.pages.end-of-day.retailLegacy")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.salesTotal)}</p>
                  <p className="text-xs text-gray-500 mt-2">{t("web.provider.reports.pages.end-of-day.retailLines", { count: data.salesCount })}</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <HeartHandshake className="w-4 h-4 text-rose-500" />
{t("web.provider.reports.pages.sales/summary.tipsLedger")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.tipsTotal)}</p>
                  <p className="text-xs text-gray-500 mt-2">
{t("web.provider.reports.pages.end-of-day.tipsHint")}
                  </p>
                  {Number(data.cashbackTotal ?? 0) > 0 ? (
                    <p className="text-xs text-gray-500 mt-2">
{t("web.provider.reports.pages.end-of-day.cashback", { amount: fmt(data.cashbackTotal) })}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <Ban className="w-4 h-4 text-orange-600" />
{t("web.provider.reports.pages.sales/summary.cancellationFees")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold tabular-nums text-gray-900">{fmt(data.cancellationFeesTotal)}</p>
                  <p className="text-xs text-gray-500 mt-2">{t("web.provider.reports.pages.end-of-day.cancelFeesHint")}</p>
                </CardContent>
              </Card>
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-600" />
{t("web.provider.reports.pages.end-of-day.distinctBookings")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold text-gray-900">{data.bookingCount}</p>
                  <p className="text-xs text-gray-500 mt-2">
{t("web.provider.reports.pages.end-of-day.distinctHint")}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-xl border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CreditCard className="w-5 h-5" />
{t("web.provider.reports.pages.end-of-day.byMethod", { date: data.date })}
                </CardTitle>
                <p className="text-sm text-gray-500 mt-1">
{t("web.provider.reports.pages.end-of-day.byMethodHint")}
                </p>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-start py-2 font-medium">{t("web.provider.reports.pages.end-of-day.method")}</th>
                      <th className="text-end py-2 font-medium">{t("web.provider.common.amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const keys = RECORDED_TAKINGS_PAYMENT_METHODS.filter(
                        (key) => Number(data.byPaymentMethod?.[key] ?? 0) >= 0.005,
                      );
                      if (keys.length === 0) {
                        return (
                          <tr>
                            <td colSpan={2} className="py-8 text-center text-sm text-gray-500">
{t("web.provider.reports.pages.end-of-day.noTakings")}
                            </td>
                          </tr>
                        );
                      }
                      return keys.map((key) => {
                        const label = paymentLabels(t)[key] ?? key;
                        const amount = Number(data.byPaymentMethod?.[key] ?? 0);
                        return (
                          <tr key={key} className="border-b border-gray-100">
                            <td className="py-2.5">{label}</td>
                            <td className="text-end py-2.5 font-mono tabular-nums font-medium">
                              {fmt(amount)}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {data.note ? (
              <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-100 pt-4">{data.note}</p>
            ) : null}
          </div>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
