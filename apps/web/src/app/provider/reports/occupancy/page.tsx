"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Calendar, BarChart3 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { format, subDays } from "date-fns";
import { ReportSkeleton } from "../components/ReportSkeleton";
import { EmptyReportState } from "../components/EmptyReportState";
import type { OccupancyResponse } from "@/app/api/provider/reports/occupancy/route";

const MAX_DAYS = 31;

export default function OccupancyReportPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);
  const [data, setData] = useState<OccupancyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"byDate" | "byStaff">("byDate");

  useEffect(() => {
    loadReport();
  }, [from, to]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams({ from, to });
      const response = await fetcher.get<{ data: OccupancyResponse }>(
        `/api/provider/reports/occupancy?${params.toString()}`
      );
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !data) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Reports", href: "/provider/reports" },
          { label: "Occupancy" },
        ]}
      >
        <ReportSkeleton />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports", href: "/provider/reports" },
        { label: "Occupancy" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Occupancy"
          subtitle="Staff utilization: booked vs available minutes"
        />

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="occ-from" className="text-sm font-medium text-gray-700">From</Label>
            <Input
              id="occ-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-[140px] rounded-xl border border-gray-200 bg-white shadow-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="occ-to" className="text-sm font-medium text-gray-700">To</Label>
            <Input
              id="occ-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-[140px] rounded-xl border border-gray-200 bg-white shadow-sm"
            />
          </div>
          <Button onClick={loadReport} disabled={isLoading} className="rounded-xl">
            {isLoading ? "Loading…" : "Update"}
          </Button>
          <div className="flex gap-2 ml-4">
            <Button
              variant={view === "byDate" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("byDate")}
              className="rounded-xl"
            >
              By date
            </Button>
            <Button
              variant={view === "byStaff" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("byStaff")}
              className="rounded-xl"
            >
              By staff
            </Button>
          </div>
        </div>

        {error && (
          <EmptyReportState title="Failed to load report" description={error} />
        )}

        {data && !error && (
          <>
            {view === "byDate" && (
              <Card className="rounded-xl border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calendar className="w-5 h-5" />
                    Occupancy by date
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium">Date</th>
                          <th className="text-right py-2 font-medium">Available (min)</th>
                          <th className="text-right py-2 font-medium">Booked (min)</th>
                          <th className="text-right py-2 font-medium">Occupancy %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byDate.map((row) => (
                          <tr key={row.date} className="border-b border-gray-100">
                            <td className="py-2">{row.date}</td>
                            <td className="text-right py-2">{row.totalAvailable}</td>
                            <td className="text-right py-2">{row.totalBooked}</td>
                            <td className="text-right py-2 font-medium">{row.occupancyPercent}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {view === "byStaff" && (
              <div className="space-y-4">
                {data.byStaff.map((staff) => (
                  <Card key={staff.staffId} className="rounded-xl border-gray-200 shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="w-4 h-4" />
                        {staff.staffName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 font-medium">Date</th>
                              <th className="text-right py-2 font-medium">Available (min)</th>
                              <th className="text-right py-2 font-medium">Booked (min)</th>
                              <th className="text-right py-2 font-medium">Occupancy %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {staff.byDate.map((row) => (
                              <tr key={row.date} className="border-b border-gray-100">
                                <td className="py-2">{row.date}</td>
                                <td className="text-right py-2">{row.availableMinutes}</td>
                                <td className="text-right py-2">{row.bookedMinutes}</td>
                                <td className="text-right py-2 font-medium">{row.occupancyPercent}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
