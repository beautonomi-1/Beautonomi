"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, UserPlus, TrendingUp, DollarSign, CheckCircle } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subMonths, format } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface NewClientsData {
  totalNewClients: number;
  returnedClients: number;
  returnRate: number;
  totalFirstBookingValue: number;
  averageFirstBookingValue: number;
  monthlyBreakdown: Array<{
    month: string;
    count: number;
  }>;
  newClients: Array<{
    customerId: string;
    clientName: string;
    email: string;
    firstVisit: string;
    firstBookingValue: number;
    hasReturned: boolean;
    totalBookings: number;
    totalSpent: number;
  }>;
}

export default function NewClientsReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subMonths(new Date(), 6),
    to: new Date(),
  });
  const [data, setData] = useState<NewClientsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [dateRange]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (dateRange.from) {
        params.append("from", dateRange.from.toISOString());
      }
      if (dateRange.to) {
        params.append("to", dateRange.to.toISOString());
      }

      const response = await fetcher.get<{ data: NewClientsData }>(
        `/api/provider/reports/clients/new?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading new clients:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setDateRange({
      from: subMonths(new Date(), 6),
      to: new Date(),
    });
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data, "new-clients");
    exportToCSV(exportData, "new-clients-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "New Clients" },
        ]}
      >
        <ReportSkeleton />
      </SettingsDetailLayout>
    );
  }

  if (error || !data) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "New Clients" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load new clients data"}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "New Clients" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="New Clients"
          subtitle="Track new client acquisition and onboarding"
          actions={
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          }
        />

        <ReportFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={handleReset}
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total New Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.totalNewClients}</p>
                <UserPlus className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Returned Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.returnedClients}</p>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Return Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.returnRate.toFixed(1)}%
                </p>
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Avg First Booking</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.averageFirstBookingValue.toLocaleString()}
                </p>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Breakdown */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>New Clients by Month</CardTitle>
          </CardHeader>
          <CardContent>
            {data.monthlyBreakdown.length === 0 ? (
              <EmptyReportState title="No new clients" description="No new clients in the selected period." />
            ) : (
              <div className="space-y-3">
                {data.monthlyBreakdown.map((item) => {
                  const [year, month] = item.month.split("-");
                  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
                  return (
                    <div
                      key={item.month}
                      className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                    >
                      <p className="font-medium text-gray-900">{monthName}</p>
                      <p className="font-semibold text-gray-900">{item.count} new clients</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent New Clients */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Recent New Clients</CardTitle>
          </CardHeader>
          <CardContent>
            {data.newClients.length === 0 ? (
              <EmptyReportState title="No new clients" description="No new clients in the selected period." />
            ) : (
              <div className="space-y-3">
                {data.newClients.map((client) => (
                  <div
                    key={client.customerId}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{client.clientName}</p>
                      <p className="text-sm text-gray-600">
                        First visit: {format(new Date(client.firstVisit), "MMM dd, yyyy")}
                      </p>
                      {client.hasReturned && (
                        <p className="text-xs text-green-600 mt-1">
                          ✓ Returned ({client.totalBookings} visits)
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        ZAR {client.firstBookingValue.toLocaleString()}
                      </p>
                      {client.totalSpent > client.firstBookingValue && (
                        <p className="text-sm text-gray-600">
                          Total: ZAR {client.totalSpent.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsDetailLayout>
  );
}
