"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, DollarSign, Users, TrendingUp } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface LifetimeValueData {
  totalClients: number;
  averageLTV: number;
  medianLTV: number;
  totalLTV: number;
  averageVisits: number;
  highValueClients: number;
  mediumValueClients: number;
  lowValueClients: number;
  topClients: Array<{
    customerId: string;
    clientName: string;
    email: string;
    totalSpent: number;
    totalBookings: number;
    averageBookingValue: number;
    daysSinceFirstVisit: number;
    visitsPerMonth: number;
  }>;
  ltvSegments: Array<{
    segment: string;
    count: number;
    avgLTV: number;
  }>;
}

export default function LifetimeValueReport() {
  const [data, setData] = useState<LifetimeValueData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: LifetimeValueData }>(
        `/api/provider/reports/clients/lifetime-value`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading lifetime value:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data, "lifetime-value");
    exportToCSV(exportData, "lifetime-value-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Lifetime Value" },
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
          { label: "Lifetime Value" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load lifetime value data"}
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
        { label: "Lifetime Value" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Lifetime Value"
          subtitle="Calculate and analyze client lifetime value"
          actions={
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Average LTV</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.averageLTV.toLocaleString()}
                </p>
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Median LTV</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.medianLTV.toLocaleString()}
                </p>
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total LTV</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  ZAR {data.totalLTV.toLocaleString()}
                </p>
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Visits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">
                  {data.averageVisits.toFixed(1)}
                </p>
                <Users className="w-5 h-5 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* LTV Segments */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>LTV Segments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.ltvSegments.map((segment) => (
                <div
                  key={segment.segment}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                >
                  <div>
                    <p className="font-medium text-gray-900">{segment.segment}</p>
                    <p className="text-sm text-gray-600">{segment.count} clients</p>
                  </div>
                  <p className="font-semibold text-gray-900">
                    ZAR {segment.avgLTV.toLocaleString()} avg
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Clients */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Top Clients by Lifetime Value</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topClients.length === 0 ? (
              <EmptyReportState title="No clients found" description="No client data available." />
            ) : (
              <div className="space-y-3">
                {data.topClients.map((client, index) => (
                  <div
                    key={client.customerId}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#FF0077] text-white font-semibold text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{client.clientName}</p>
                        <p className="text-sm text-gray-600">
                          {client.totalBookings} visits • {Math.floor(client.daysSinceFirstVisit / 30)} months
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        ZAR {client.totalSpent.toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-600">
                        ZAR {client.averageBookingValue.toLocaleString()} avg
                      </p>
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
