"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Users, TrendingUp, DollarSign, Calendar, Star } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import { exportToCSV, exportToPDF, formatReportDataForExport } from "../../utils/export";

interface ClientSummaryData {
  totalClients: number;
  newClients: number;
  returningClients: number;
  averageBookingsPerClient: number;
  averageLifetimeValue: number;
  topClients: Array<{
    clientId: string;
    clientName: string;
    totalBookings: number;
    totalSpent: number;
    lastVisit: string;
    averageRating: number;
  }>;
  clientRetention: {
    period: string;
    retentionRate: number;
  };
}

export default function ClientSummaryReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 90),
    to: new Date(),
  });
  const [data, setData] = useState<ClientSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);

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

      const response = await fetcher.get<{ data: ClientSummaryData }>(
        `/api/provider/reports/clients/summary?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      if (err instanceof FetchError && err.code === "SUBSCRIPTION_REQUIRED") {
        setIsSubscriptionRequired(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load report");
        setIsSubscriptionRequired(false);
      }
      console.error("Error loading client summary:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setDateRange({
      from: subDays(new Date(), 90),
      to: new Date(),
    });
  };

  const handleExport = (format: "csv" | "pdf" = "csv") => {
    if (!data) return;
    if (format === "csv") {
      const exportData = formatReportDataForExport(data, "client-summary");
      exportToCSV(exportData, "client-summary-report");
    } else {
      exportToPDF("client-summary-report", "client-summary-report", "Client Summary Report");
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Client Summary" },
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
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Client Summary" },
        ]}
      >
        <div className="space-y-6">
          <PageHeader
            title="Client Summary"
            subtitle="Understand your client base and retention"
          />
          <SubscriptionGate
            feature="Client Summary Reports"
            message="Advanced reports require a Professional plan or higher."
            upgradeMessage="Upgrade to access detailed client analytics, retention metrics, and lifetime value tracking."
          />
        </div>
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
          { label: "Client Summary" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load client summary data"}
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
        { label: "Client Summary" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="client-summary-report">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title="Client Summary"
            subtitle="Understand your client base and retention"
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleExport("csv")} className="gap-2 min-h-[44px] touch-manipulation">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </Button>
            <Button variant="outline" onClick={() => handleExport("pdf")} className="gap-2 min-h-[44px] touch-manipulation">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">PDF</span>
            </Button>
          </div>
        </div>

        <ReportFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={handleReset}
        />

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Clients
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {data.totalClients}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                New Clients
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {data.newClients}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Avg Lifetime Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-purple-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.averageLifetimeValue.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Avg Bookings/Client
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-orange-600" />
                <p className="text-2xl font-semibold text-gray-900">
                  {data.averageBookingsPerClient.toFixed(1)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Client Retention */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Client Retention</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600 mb-1">Retention Rate</p>
                <p className="text-3xl font-bold text-gray-900">
                  {data.clientRetention.retentionRate.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {data.clientRetention.period}
                </p>
              </div>
              <div className="p-4 bg-white rounded-lg shadow-sm">
                <Users className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Clients */}
        {data.topClients && data.topClients.length > 0 ? (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Top Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.topClients.map((client, index) => (
                <div
                  key={client.clientId}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF0077] to-[#D60565] flex items-center justify-center text-white font-semibold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {client.clientName}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-xs text-gray-600">
                          {client.totalBookings} booking{client.totalBookings !== 1 ? "s" : ""}
                        </p>
                        {client.averageRating > 0 && (
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                            <span className="text-xs text-gray-600">
                              {client.averageRating.toFixed(1)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      ZAR {client.totalSpent.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      Last visit: {new Date(client.lastVisit).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Top Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                No client data available for the selected period.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
