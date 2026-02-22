"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Package, Users } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { exportToCSV, formatReportDataForExport } from "../../utils/export";

interface PackageUsageData {
  totalPackagesUsed: number;
  totalUniqueClients: number;
  packageUsage: Array<{
    packageId: string;
    packageName: string;
    totalUsage: number;
    uniqueClientsCount: number;
    averageUsagePerClient: number;
  }>;
  topClients: Array<{
    clientId: string;
    clientName: string;
    email: string;
    packagesUsed: number;
  }>;
}

export default function PackageUsageReport() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 90),
    to: new Date(),
  });
  const [data, setData] = useState<PackageUsageData | null>(null);
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

      const response = await fetcher.get<{ data: PackageUsageData }>(
        `/api/provider/reports/packages/usage?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      console.error("Error loading package usage:", err);
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

  const handleExport = () => {
    if (!data) return;
    const exportData = formatReportDataForExport(data, "package-usage");
    exportToCSV(exportData, "package-usage-report");
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Package Usage" },
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
          { label: "Package Usage" },
        ]}
      >
        <EmptyReportState
          title="Failed to load report"
          description={error || "Unable to load package usage data"}
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
        { label: "Package Usage" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Package Usage"
          subtitle="Track package usage and client engagement"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Packages Used</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.totalPackagesUsed}</p>
                <Package className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Unique Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-semibold text-gray-900">{data.totalUniqueClients}</p>
                <Users className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Package Usage Breakdown */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle>Package Usage by Package</CardTitle>
          </CardHeader>
          <CardContent>
            {data.packageUsage.length === 0 ? (
              <EmptyReportState title="No package usage" description="No package usage in the selected period." />
            ) : (
              <div className="space-y-3">
                {data.packageUsage.map((pkg, index) => (
                  <div
                    key={pkg.packageId}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#FF0077] text-white font-semibold text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{pkg.packageName}</p>
                        <p className="text-sm text-gray-600">
                          {pkg.uniqueClientsCount} clients • {pkg.averageUsagePerClient.toFixed(1)} avg per client
                        </p>
                      </div>
                    </div>
                    <p className="font-semibold text-gray-900">{pkg.totalUsage} uses</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Clients */}
        {data.topClients.length > 0 && (
          <Card className="border-gray-200">
            <CardHeader>
              <CardTitle>Top Clients by Package Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.topClients.map((client, index) => (
                  <div
                    key={client.clientId}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-semibold text-sm">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{client.clientName}</p>
                        <p className="text-sm text-gray-600">{client.email}</p>
                      </div>
                    </div>
                    <p className="font-semibold text-gray-900">{client.packagesUsed} packages</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
