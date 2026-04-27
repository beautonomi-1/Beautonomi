"use client";

import React, { useState, useEffect, useCallback } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { PaymentTransaction, FilterParams, PaginationParams } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/provider-portal/Money";
import { Search, MoreVertical } from "lucide-react";
import Pagination from "@/components/ui/pagination";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ProviderPayments() {
  const [hasMounted, setHasMounted] = useState(false);
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<string>("month");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadPayments = useCallback(async () => {
    try {
      setIsLoading(true);
      const filters: FilterParams = {
        search: debouncedSearchQuery || undefined,
      };

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
    } catch (error) {
      console.error("Failed to load payments:", error);
      toast.error("Failed to load payments. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [page, dateRange, debouncedSearchQuery]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    loadPayments();
  }, [hasMounted, loadPayments]);

  useEffect(() => {
    if (!hasMounted) return;
    const debounceTimer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      if (page !== 1) {
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [hasMounted, page, searchQuery]);

  if (!hasMounted) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-sm text-gray-600">Loading payments...</p>
      </div>
    );
  }

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading payments..." />;
  }

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="View all payment transactions"
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <MoreVertical className="w-4 h-4 mr-2" />
                Options
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Export</DropdownMenuItem>
              <DropdownMenuItem>Print</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      {/* Filters */}
      <div className="mb-6 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search payments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">Month to Date</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Payments List */}
      {payments.length === 0 ? (
        <SectionCard className="p-12 text-center">
          <EmptyState
            title="No payment transactions yet"
            description="Payment transactions will appear here"
            />
          </SectionCard>
      ) : (
        <>
          {/* Mobile card layout */}
          <div className="md:hidden space-y-3">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="rounded-lg border bg-white p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{payment.ref_number}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatPaymentDate(payment.payment_date)}
                    </p>
                  </div>
                  <p className="font-semibold text-sm shrink-0">
                    <Money amount={payment.amount} />
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                  {payment.team_member_name && (
                    <span>{payment.team_member_name}</span>
                  )}
                  <span className="capitalize">{payment.method.replace("_", " ")}</span>
                  {payment.appointment_duration && (
                    <span>{payment.appointment_duration} min</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table layout */}
          <div className="hidden md:block bg-white border border-gray-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref #</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Team Member</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">{payment.ref_number}</TableCell>
                    <TableCell>{formatPaymentDate(payment.payment_date)}</TableCell>
                    <TableCell>
                      {payment.appointment_duration ? `${payment.appointment_duration} min` : "-"}
                    </TableCell>
                    <TableCell>{payment.team_member_name || "-"}</TableCell>
                    <TableCell className="capitalize">{payment.method.replace("_", " ")}</TableCell>
                    <TableCell className="text-right font-semibold">
                      <Money amount={payment.amount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatPaymentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}
