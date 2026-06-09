"use client";

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
import { toast } from "sonner";

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Booking/order payment search — folded from the legacy /provider/payments page. */
export function FinanceBookingPaymentsSection() {
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
      if (dateRange === "today") {
        const today = formatLocalDate(now);
        filters.date_from = today;
        filters.date_to = today;
      } else if (dateRange === "week") {
        const day = now.getDay();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - day);
        const weekEnd = new Date(now);
        weekEnd.setDate(now.getDate() + (6 - day));
        filters.date_from = formatLocalDate(weekStart);
        filters.date_to = formatLocalDate(weekEnd);
      } else if (dateRange === "month") {
        filters.date_from = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
        filters.date_to = formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      }
      const pagination: PaginationParams = { page, limit: 20 };
      const response = await providerApi.listPayments(filters, pagination);
      setPayments(response.data);
      setTotalPages(response.total_pages);
    } catch {
      toast.error("Failed to load customer payments. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [expanded, page, dateRange, debouncedSearchQuery]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  return (
    <div className="bg-white border rounded-lg p-6 mb-8" id="customer-payments">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Customer payments</h2>
          <p className="text-sm text-gray-500 mt-1">
            Search card, wallet and till captures tied to bookings and orders — separate from your ledger above.
          </p>
        </div>
        <Button variant="outline" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide" : "Show search"}
        </Button>
      </div>

      {expanded ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Search by client, booking ref, or amount…"
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
                  {range === "today" ? "Today" : range === "week" ? "This week" : "This month"}
                </Button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <LoadingTimeout loadingMessage="Loading payments…" />
          ) : payments.length === 0 ? (
            <EmptyState title="No payments found" description="Try a different search or date range." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
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
                          : "—"}
                      </TableCell>
                      <TableCell>{payment.ref_number || payment.team_member_name || "—"}</TableCell>
                      <TableCell>{formatStatusLabel(payment.method)}</TableCell>
                      <TableCell>{formatStatusLabel(payment.status)}</TableCell>
                      <TableCell className="text-right">{fmt(payment.amount)}</TableCell>
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
