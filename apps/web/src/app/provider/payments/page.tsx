"use client";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { PaymentTransaction, FilterParams, PaginationParams } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money } from "@/components/provider-portal/Money";
import { Search, Filter, MoreVertical } from "lucide-react";
import Pagination from "@/components/ui/pagination";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ProviderPayments() {
  const [payments, setPayments] = useState<PaymentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<string>("month");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadPayments();
  }, [page, dateRange]);

  const loadPayments = async () => {
    try {
      setIsLoading(true);
      const filters: FilterParams = {
        search: searchQuery || undefined,
      };

      if (dateRange === "month") {
        const now = new Date();
        filters.date_from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
        filters.date_to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      }

      const pagination: PaginationParams = { page, limit: 20 };
      const response = await providerApi.listPayments(filters, pagination);
      setPayments(response.data);
      setTotalPages(response.total_pages);
    } catch (error) {
      console.error("Failed to load payments:", error);
    } finally {
      setIsLoading(false);
    }
  };

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
        <Button variant="outline">
          <Filter className="w-4 h-4 mr-2" />
          Filter
        </Button>
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
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
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
                    <TableCell>{new Date(payment.payment_date).toLocaleDateString()}</TableCell>
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
