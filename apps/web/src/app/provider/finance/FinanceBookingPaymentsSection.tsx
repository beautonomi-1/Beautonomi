"use client";

import { useTranslation } from "@beautonomi/i18n";

import { useCallback, useEffect, useState } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { FilterParams, PaginationParams, PaymentTransaction } from "@/lib/provider-portal/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";
import Pagination from "@/components/ui/pagination";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { formatStatusLabel } from "@/lib/locale/status-label";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { resolveProviderFinanceRangeBounds } from "@/lib/dates/provider-finance-range";
import { formatDateYmd } from "@/lib/dates/provider-tz";
import { toast } from "sonner";

/** Booking/order payment search — folded from the legacy /provider/payments page. */
export function FinanceBookingPaymentsSection({ timezone }: { timezone?: string | null }) {
  const { t } = useTranslation();
  const { format: fmt } = useReportCurrency();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("view=payments")) {
      setExpanded(true);
    }
  }, []);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<string>("month");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      if (page !== 1) setPage(1);
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, page]);

  const loadPayments = useCallback(async () => {
    if (!expanded) return;
    try {
      setIsLoading(true);
      const filters: FilterParams = { search: debouncedSearchQuery || undefined };
      const now = new Date();
      const rangeKey =
        dateRange === "today" || dateRange === "week" || dateRange === "month"
          ? dateRange
          : "month";
      const bounds = resolveProviderFinanceRangeBounds(rangeKey, timezone ?? "Africa/Johannesburg", now);
      filters.date_from = formatDateYmd(bounds.startDate, timezone ?? "Africa/Johannesburg");
      filters.date_to = formatDateYmd(now, timezone ?? "Africa/Johannesburg");
      const pagination: PaginationParams = { page, limit: 20 };
      const response = await providerApi.listPayments(filters, pagination);
      setPayments(response.data);
      setTotalPages(response.total_pages);
    } catch {
      toast.error(t("web.provider.finance.bookingPayments.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [expanded, page, dateRange, debouncedSearchQuery, timezone]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  return (
    <div className="bg-white border rounded-lg p-6 mb-8" id="customer-payments">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
<h2 className="text-xl font-semibold">{t("web.provider.finance.bookingPayments.title")}</h2>
          <p className="text-sm text-gray-500 mt-1">
{t("web.provider.finance.bookingPayments.subtitle")}
          </p>
        </div>
        <Button variant="outline" onClick={() => setExpanded((v) => !v)}>
{expanded ? t("web.provider.common.hide") : t("web.provider.finance.bookingPayments.showSearch")}
        </Button>
      </div>

      {expanded ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                className="ps-9"
placeholder={t("web.provider.finance.bookingPayments.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              {(["today", "week", "month"] as const).map((range) => (
                <Button
                  key={range}
                  variant={dateRange === range ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateRange(range)}
                >
{range === "today" ? t("web.provider.finance.rangeToday") : range === "week" ? t("web.provider.finance.rangeThisWeek") : t("web.provider.finance.rangeThisMonth")}
                </Button>
              ))}
            </div>
          </div>

          {isLoading ? (
<LoadingTimeout loadingMessage={t("web.provider.finance.bookingPayments.loading")} />
          ) : payments.length === 0 ? (
<EmptyState title={t("web.provider.finance.bookingPayments.emptyTitle")} description={t("web.provider.finance.bookingPayments.emptyDesc")} />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
<TableHead>{t("web.provider.common.date")}</TableHead>
<TableHead>{t("web.provider.finance.bookingPayments.reference")}</TableHead>
<TableHead>{t("web.provider.finance.bookingPayments.method")}</TableHead>
<TableHead>{t("web.provider.common.statusLabel")}</TableHead>
<TableHead className="text-end">{t("web.provider.common.amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {payment.payment_date
                          ? new Date(payment.payment_date).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : t("web.provider.common.emDash")}
                      </TableCell>
<TableCell>{payment.ref_number || payment.team_member_name || t("web.provider.common.emDash")}</TableCell>
                      <TableCell>{formatStatusLabel(payment.method)}</TableCell>
                      <TableCell>{formatStatusLabel(payment.status)}</TableCell>
                      <TableCell className="text-end">{fmt(payment.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 ? (
                <div className="mt-4">
                  <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
