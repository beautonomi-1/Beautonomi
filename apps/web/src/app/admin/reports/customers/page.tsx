"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Users, ShoppingBag, DollarSign } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CustomerReportData {
  period: string;
  totalCustomers: number;
  customersWithBookings: number;
  customers: Array<{
    customer_id: string;
    customer_name: string;
    bookings_count: number;
    total_spent: number;
  }>;
}

export default function CustomerReportPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CustomerReportData | null>(null);
  const [period, setPeriod] = useState("30d");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    loadReport();
  }, [period, startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("period", period);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);

      const response = await fetcher.get<{ data: CustomerReportData }>(
        `/api/admin/reports/customers?${params.toString()}`
      );
      const reportData = (response as { data?: CustomerReportData }).data || response;
      setData(reportData as CustomerReportData);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
            ? err.message
            : "Failed to load customer report";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      params.set("period", period);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);

      const response = await fetch(`/api/admin/reports/customers?${params.toString()}`);
      if (!response.ok) throw new Error("Export failed");

      const json = await response.json();
      const rows = data?.customers ?? json?.data?.customers ?? [];
      const csv = [
        "Customer Name,Bookings,Total Spent (ZAR)",
        ...rows.map(
          (c: { customer_name: string; bookings_count: number; total_spent: number }) =>
            `${c.customer_name},${c.bookings_count},${c.total_spent}`
        ),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customer-report-${period}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Export downloaded");
    } catch {
      toast.error("Failed to export report");
    }
  };

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]}>
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading customer report..." />
        </div>
      </RoleGuard>
    );
  }

  if (error || !data) {
    return (
      <RoleGuard allowedRoles={["superadmin"]}>
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Failed to load customer report"
            description={error || "Unable to load report data"}
            action={{
              label: "Retry",
              onClick: loadReport,
            }}
          />
        </div>
      </RoleGuard>
    );
  }

  const topBySpend = data.customers.slice(0, 10);

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Customer Report</h1>
            <p className="text-gray-600 mt-1">Customer behavior analysis, booking patterns, and lifetime value</p>
          </div>
          <Button onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Period</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                    <SelectItem value="1y">Last year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                  className="w-full"
                >
                  Clear Dates
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.totalCustomers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Customers with Bookings</CardTitle>
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.customersWithBookings}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Spent (period)</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R {data.customers.reduce((sum, c) => sum + (c.total_spent || 0), 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {topBySpend.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Top Customers by Spend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topBySpend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="customer_name"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis tickFormatter={(v) => `R ${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [`R ${value.toLocaleString()}`, "Total Spent"]} />
                  <Legend />
                  <Bar dataKey="total_spent" fill="#ec4899" name="Total Spent (R)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Customer List</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(data.customers ?? []).length > 0 ? (
                data.customers.map((c) => (
                  <div
                    key={c.customer_id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{c.customer_name}</p>
                      <p className="text-sm text-gray-600">{c.bookings_count} bookings</p>
                    </div>
                    <p className="font-semibold text-blue-600">
                      R {(c.total_spent ?? 0).toLocaleString()}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 py-4 text-center">No customer data for this period</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
