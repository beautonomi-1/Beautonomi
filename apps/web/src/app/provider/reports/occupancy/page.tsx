"use client";

import React, { useState, useEffect, useMemo } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Calendar, Download, Timer, Activity, Info, TrendingUp } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { ReportSkeleton } from "../components/ReportSkeleton";
import { EmptyReportState } from "../components/EmptyReportState";
import type { OccupancyResponse } from "@/app/api/provider/reports/occupancy/route";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { exportToCSV, exportToPDF, formatReportDataForExport, type ReportRow } from "../utils/export";
import { OccupancyMinutesChart, OccupancyPercentChart } from "./components/OccupancyCharts";

const MAX_DAYS = 31;

function formatPct(p: number | null): string {
  if (p === null) return "—";
  return `${p}%`;
}

export default function OccupancyReportPage() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { currencyCode: exportCurrency } = useReportCurrency();
  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);
  const [data, setData] = useState<OccupancyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"byDate" | "byStaff">("byDate");

  const rangeDayCount = useMemo(() => {
    try {
      return differenceInCalendarDays(parseISO(to), parseISO(from)) + 1;
    } catch {
      return 0;
    }
  }, [from, to]);

  useEffect(() => {
    loadReport();
  }, [from, to, selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);
      if (from > to) {
        setError("'From' must be on or before 'To'.");
        setData(null);
        return;
      }
      if (rangeDayCount > MAX_DAYS) {
        setError(`Choose at most ${MAX_DAYS} inclusive days (your range is ${rangeDayCount} days).`);
        setData(null);
        return;
      }
      const params = new URLSearchParams({ from, to });
      appendLocation(params);
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

  const handleExport = (fmt: "csv" | "pdf" = "csv") => {
    if (!data) return;
    if (fmt === "csv") {
      const rows = formatReportDataForExport(data as unknown as ReportRow, "occupancy", exportCurrency);
      exportToCSV(rows, "occupancy-report");
    } else {
      exportToPDF("occupancy-report", "occupancy-report", "Occupancy report");
    }
  };

  const summary = data?.summary;
  const overCapacity =
    summary &&
    summary.totalBookedMinutes > summary.totalAvailableMinutes &&
    summary.totalAvailableMinutes > 0;

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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <PageHeader
            title="Occupancy"
            subtitle="Booked service minutes vs scheduled staff availability (provider timezone)"
          />
          {data && !error && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => handleExport("csv")}>
                <Download className="mr-1 h-4 w-4" />
                CSV
              </Button>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => handleExport("pdf")}>
                Print / PDF
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="occ-from" className="text-sm font-medium text-gray-700">
              From
            </Label>
            <Input
              id="occ-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-[160px] rounded-xl border border-gray-200 bg-white shadow-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="occ-to" className="text-sm font-medium text-gray-700">
              To
            </Label>
            <Input
              id="occ-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-[160px] rounded-xl border border-gray-200 bg-white shadow-sm"
            />
          </div>
          <Button onClick={() => void loadReport()} disabled={isLoading} className="rounded-xl">
            {isLoading ? "Loading…" : "Update"}
          </Button>
          <div className="flex gap-2 sm:ml-2">
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

        {rangeDayCount > MAX_DAYS && (
          <p className="text-sm text-amber-800">
            Range is {rangeDayDaysLabel(rangeDayCount)} — maximum {MAX_DAYS} days.
          </p>
        )}

        {error && <EmptyReportState title="Report unavailable" description={error} />}

        {data && !error && (
          <div id="occupancy-report" className="space-y-6">
            {data.basisNote ? (
              <div className="flex gap-3 rounded-xl border border-sky-200/90 bg-sky-50/95 px-4 py-3 text-sm leading-relaxed text-sky-950">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden />
                <div>
                  <p className="font-medium text-sky-900">Facts & definitions</p>
                  <p className="mt-1">{data.basisNote}</p>
                  {data.includedBookingStatuses?.length ? (
                    <p className="mt-2 text-xs text-sky-900/85">
                      Booking statuses included: {data.includedBookingStatuses.join(", ")}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {summary ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="border-gray-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Period occupancy</CardTitle>
                    <p className="text-xs text-gray-500">Total booked ÷ total available minutes</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-2xl font-semibold tabular-nums tracking-tight text-violet-900">
                        {formatPct(summary.occupancyPercent)}
                      </p>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                        <TrendingUp className="h-5 w-5 text-violet-700" />
                      </div>
                    </div>
                    {summary.occupancyPercent !== null && summary.occupancyPercent > 100 ? (
                      <p className="mt-2 text-xs leading-snug text-amber-800">
                        Above 100% means booked service time exceeds summed schedule windows (overlapping services or long
                        appointments vs shift length).
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="border-gray-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Scheduled availability</CardTitle>
                    <p className="text-xs text-gray-500">Minutes in range</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-2xl font-semibold tabular-nums text-gray-900">
                        {summary.totalAvailableMinutes.toLocaleString()}
                      </p>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                        <Timer className="h-5 w-5 text-slate-700" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-gray-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Booked service time</CardTitle>
                    <p className="text-xs text-gray-500">Sum of service durations</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-2xl font-semibold tabular-nums text-teal-900">
                        {summary.totalBookedMinutes.toLocaleString()}
                      </p>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50">
                        <Activity className="h-5 w-5 text-teal-700" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-gray-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Staff in scope</CardTitle>
                    <p className="text-xs text-gray-500">
                      {summary.dayCount} day{summary.dayCount === 1 ? "" : "s"} · {data.timezone}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-2xl font-semibold tabular-nums text-gray-900">{summary.staffMemberCount}</p>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
                        <Users className="h-5 w-5 text-gray-700" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {overCapacity ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Period booked minutes exceed summed availability — review schedules or booking durations for accuracy.
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card className="border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Minutes by day</CardTitle>
                  <p className="text-sm font-normal text-gray-500">
                    Available (schedule) vs booked (confirmed → completed services).
                  </p>
                </CardHeader>
                <CardContent>
                  <OccupancyMinutesChart rows={data.byDate} />
                </CardContent>
              </Card>
              <Card className="border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Occupancy % by day</CardTitle>
                  <p className="text-sm font-normal text-gray-500">
                    Daily booked ÷ daily summed availability. Reference line at 100%.
                  </p>
                </CardHeader>
                <CardContent>
                  <OccupancyPercentChart rows={data.byDate} />
                </CardContent>
              </Card>
            </div>

            {view === "byDate" && (
              <Card className="border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Calendar className="h-5 w-5" />
                    By date
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50/80">
                          <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                          <th className="px-4 py-3 text-right font-semibold text-gray-700">Available (min)</th>
                          <th className="px-4 py-3 text-right font-semibold text-gray-700">Booked (min)</th>
                          <th className="px-4 py-3 text-right font-semibold text-gray-700">Occupancy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byDate.map((row) => (
                          <tr key={row.date} className="border-b border-gray-50 hover:bg-gray-50/60">
                            <td className="px-4 py-3 font-medium text-gray-900">{row.date}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-800">{row.totalAvailable}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-800">{row.totalBooked}</td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                              {formatPct(row.occupancyPercent)}
                            </td>
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
                {data.byStaff.length === 0 ? (
                  <Card className="border-gray-200 shadow-sm">
                    <CardContent className="py-8 text-center text-sm text-gray-600">
                      No active staff match this filter.
                    </CardContent>
                  </Card>
                ) : (
                  data.byStaff.map((staff) => (
                    <Card key={staff.staffId} className="border-gray-200 shadow-sm">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Users className="h-4 w-4" />
                          {staff.staffName}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto rounded-xl border border-gray-100">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50/80">
                                <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Available (min)</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Booked (min)</th>
                                <th className="px-4 py-3 text-right font-semibold text-gray-700">Occupancy</th>
                              </tr>
                            </thead>
                            <tbody>
                              {staff.byDate.map((row) => (
                                <tr key={row.date} className="border-b border-gray-50 hover:bg-gray-50/60">
                                  <td className="px-4 py-3 font-medium text-gray-900">{row.date}</td>
                                  <td className="px-4 py-3 text-right tabular-nums text-gray-800">{row.availableMinutes}</td>
                                  <td className="px-4 py-3 text-right tabular-nums text-gray-800">{row.bookedMinutes}</td>
                                  <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                                    {formatPct(row.occupancyPercent)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </SettingsDetailLayout>
  );
}

function rangeDayDaysLabel(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}
