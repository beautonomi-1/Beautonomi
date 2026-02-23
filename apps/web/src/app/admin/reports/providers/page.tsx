"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Building2, Users, DollarSign } from "lucide-react";
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

interface ProviderReportData {
  period: string;
  totalProviders: number;
  activeProviders: number;
  providers: Array<{
    provider_id: string;
    provider_name: string;
    status: string;
    rating_average: number;
    bookings_count: number;
    revenue: number;
  }>;
}

export default function ProviderReportPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProviderReportData | null>(null);
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

      const response = await fetcher.get<{ data: ProviderReportData }>(
        `/api/admin/reports/providers?${params.toString()}`
      );
      const reportData = (response as { data?: ProviderReportData }).data || response;
      setData(reportData as ProviderReportData);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
            ? err.message
            : "Failed to load provider report";
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

      const response = await fetch(`/api/admin/reports/providers?${params.toString()}`);
      if (!response.ok) throw new Error("Export failed");

      const json = await response.json();
      const rows = data?.providers ?? json?.data?.providers ?? [];
      const csv = [
        "Provider Name,Status,Rating,Bookings,Revenue (ZAR)",
        ...rows.map(
          (p: { provider_name: string; status: string; rating_average: number; bookings_count: number; revenue: number }) =>
            `${p.provider_name},${p.status},${p.rating_average},${p.bookings_count},${p.revenue}`
        ),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `provider-report-${period}-${new Date().toISOString().split("T")[0]}.csv`;
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
          <LoadingTimeout loadingMessage="Loading provider report..." />
        </div>
      </RoleGuard>
    );
  }

  if (error || !data) {
    return (
      <RoleGuard allowedRoles={["superadmin"]}>
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Failed to load provider report"
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

  const topByRevenue = data.providers.slice(0, 10);

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Provider Report</h1>
            <p className="text-gray-600 mt-1">Provider performance metrics, revenue, and booking statistics</p>
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
              <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.totalProviders}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Providers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.activeProviders}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue (period)</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R {data.providers.reduce((sum, p) => sum + (p.revenue || 0), 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {topByRevenue.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Top Providers by Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topByRevenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="provider_name"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis tickFormatter={(v) => `R ${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => [`R ${value.toLocaleString()}`, "Revenue"]} />
                  <Legend />
                  <Bar dataKey="revenue" fill="#8b5cf6" name="Revenue (R)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Provider List</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(data.providers ?? []).length > 0 ? (
                data.providers.map((p) => (
                  <div
                    key={p.provider_id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{p.provider_name}</p>
                      <p className="text-sm text-gray-600">
                        {p.bookings_count} bookings • Rating: {p.rating_average ? p.rating_average.toFixed(1) : "—"} • {p.status}
                      </p>
                    </div>
                    <p className="font-semibold text-green-600">
                      R {(p.revenue ?? 0).toLocaleString()}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 py-4 text-center">No provider data for this period</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
