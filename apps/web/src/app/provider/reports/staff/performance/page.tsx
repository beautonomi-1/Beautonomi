"use client";
import { useTranslation } from "@beautonomi/i18n";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { ReportFilters, DateRange } from "../../components/ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Users, CalendarRange, Wallet, Star, Info } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { subDays } from "date-fns";
import { ReportSkeleton } from "../../components/ReportSkeleton";
import { EmptyReportState } from "../../components/EmptyReportState";
import { parseReportLoadError } from "@/lib/reports/is-subscription-required-error";
import { ReportSubscriptionRequired } from "@/app/provider/reports/components/ReportSubscriptionRequired";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { appendReportDateParams } from "@/app/provider/reports/utils/report-api-url";
import { exportToCSV, exportToPDF, formatReportDataForExport, type ReportRow } from "../../utils/export";
import { StaffLedgerBarChart } from "../components/StaffLedgerBarChart";

interface StaffPerformanceData {
  staffMembers: Array<{
    staffId: string;
    staffName: string;
    totalBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    noShows: number;
    totalRevenue: number;
    averageBookingValue: number;
    totalHours: number;
    averageRating: number;
    totalReviews: number;
    commissionEarned: number;
    commissionEnabled: boolean;
    tipsEnabled: boolean;
  }>;
  summary: {
    totalStaff: number;
    uniqueAppointments: number;
    staffAssignmentTouches?: number;
    totalRevenue: number;
    averageRating: number;
    /** @deprecated API versions before unique appointments */
    totalBookings?: number;
  };
  basisNote?: string;
  ledgerTransactionTypes?: string[];
}

export default function StaffPerformanceReport() {
  const { selectedLocationId, appendLocation } = useReportLocationQuery();
  const { t } = useTranslation();
  const { currencyCode: exportCurrency, format: fmt } = useReportCurrency();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [data, setData] = useState<StaffPerformanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionRequired, setIsSubscriptionRequired] = useState(false);
  const [subscriptionGateMessage, setSubscriptionGateMessage] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    loadReport();
  }, [dateRange, selectedStaff, selectedLocationId]);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      appendReportDateParams(params, dateRange);
      if (selectedStaff) {
        params.append("staffId", selectedStaff);
      }
      appendLocation(params);

      const response = await fetcher.get<{ data: StaffPerformanceData }>(
        `/api/provider/reports/staff/performance?${params.toString()}`
      );
      setData(response.data);

      // Extract staff options from response
      if (response.data.staffMembers) {
        setStaffOptions(
          response.data.staffMembers.map((staff) => ({
            id: staff.staffId,
            name: staff.staffName,
          }))
        );
      }
    } catch (err) {
      const parsed = parseReportLoadError(err);
      if (parsed.subscriptionRequired) {
        setIsSubscriptionRequired(true);
        setSubscriptionGateMessage(parsed.message);
        setError(null);
      } else {
        setError(parsed.message);
        setIsSubscriptionRequired(false);
        setSubscriptionGateMessage(null);
      }
      console.error("Error loading staff performance:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setDateRange({
      from: subDays(new Date(), 30),
      to: new Date(),
    });
    setSelectedStaff(null);
  };

  const handleExport = (format: "csv" | "pdf" = "csv") => {
    if (!data) return;
    if (format === "csv") {
      const exportData = formatReportDataForExport(data as unknown as ReportRow, "staff-performance", exportCurrency);
      exportToCSV(exportData, "staff-performance-report");
    } else {
      exportToPDF("staff-performance-report", "staff-performance-report", t("web.provider.reports.pages.staff/performance.reportTitle"));
    }
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.staff/performance.title") },
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
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.staff/performance.title") },
        ]}
      >
        <div className="space-y-6">
          <PageHeader
            title={t("web.provider.reports.pages.staff/performance.title")}
            subtitle={t("web.provider.reports.pages.staff/performance.subtitle")}
          />
          <ReportSubscriptionRequired
            feature={t("web.provider.reports.pages.staff/performance.feature")}
            message={subscriptionGateMessage}
          />
        </div>
      </SettingsDetailLayout>
    );
  }

  if (error || !data) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
          { label: t("web.provider.reports.pages.staff/performance.title") },
        ]}
      >
        <EmptyReportState
          title={t("web.provider.common.failedToLoadReport")}
          description={error || t("web.provider.reports.pages.staff/performance.unableToLoad")}
        />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.reports"), href: "/provider/reports" },
        { label: t("web.provider.reports.pages.staff/performance.title") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6" id="staff-performance-report">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title={t("web.provider.reports.pages.staff/performance.title")}
            subtitle={t("web.provider.reports.pages.staff/performance.subtitle")}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleExport("csv")} className="gap-2 min-h-[44px] touch-manipulation">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t("web.provider.common.exportCsv")}</span>
              <span className="sm:hidden">{t("web.provider.common.csv")}</span>
            </Button>
            <Button variant="outline" onClick={() => handleExport("pdf")} className="gap-2 min-h-[44px] touch-manipulation">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t("web.provider.common.exportPdf")}</span>
              <span className="sm:hidden">{t("web.provider.common.pdf")}</span>
            </Button>
          </div>
        </div>

        <ReportFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onReset={handleReset}
          showStaffFilter={true}
          staffOptions={staffOptions}
          selectedStaff={selectedStaff}
          onStaffChange={setSelectedStaff}
        />

        {data.basisNote ? (
          <div className="flex gap-3 rounded-xl border border-violet-200/90 bg-violet-50/95 px-4 py-3 text-sm leading-relaxed text-violet-950">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" aria-hidden />
            <div>
              <p className="font-medium text-violet-900">{t("web.provider.reports.common.factsAndDefinitions")}</p>
              <p className="mt-1">{data.basisNote}</p>
              {data.ledgerTransactionTypes?.length ? (
                <p className="mt-2 text-xs text-violet-900/85">
                  {t("web.provider.reports.pages.staff/performance.ledgerIncludes", { types: data.ledgerTransactionTypes.join(", ") })}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.staff/performance.teamSize")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.staff/performance.inReportScope")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{data.summary.totalStaff}</p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50">
                  <Users className="h-5 w-5 text-sky-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.staff/performance.uniqueAppointments")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.staff/performance.uniqueAppointmentsHint")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
                  {data.summary.uniqueAppointments ?? data.summary.totalBookings ?? t("web.provider.common.emDash")}
                </p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50">
                  <CalendarRange className="h-5 w-5 text-teal-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.staff/performance.ledgerNetTotal")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.staff/performance.ledgerNetTotalHint")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
                  {fmt(data.summary.totalRevenue)}
                </p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
                  <Wallet className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">{t("web.provider.reports.pages.staff/performance.avgRating")}</CardTitle>
              <p className="text-xs text-gray-500">{t("web.provider.reports.pages.staff/performance.avgRatingHint")}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
                  {data.summary.averageRating.toFixed(1)}
                </p>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                  <Star className="h-5 w-5 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {data.staffMembers?.length ? (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{t("web.provider.reports.pages.staff/performance.ledgerNetByStaff")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">{t("web.provider.reports.pages.staff/performance.ledgerNetByStaffHint")}</p>
            </CardHeader>
            <CardContent className="pt-2">
              <StaffLedgerBarChart
                rows={data.staffMembers.map((s) => ({
                  staffName: s.staffName,
                  totalRevenue: s.totalRevenue,
                }))}
              />
            </CardContent>
          </Card>
        ) : null}

        {/* Staff Performance Table */}
        {data.staffMembers && data.staffMembers.length > 0 ? (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{t("web.provider.reports.pages.staff/performance.detailByMember")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">
                {t("web.provider.reports.pages.staff/performance.detailByMemberHint")}
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-start py-3 px-4 text-sm font-semibold text-gray-700">
                      {t("web.provider.reports.pages.staff/performance.staffMember")}
                    </th>
                    <th className="text-end py-3 px-4 text-sm font-semibold text-gray-700">
                      {t("web.provider.reports.pages.staff/performance.bookings")}
                    </th>
                    <th className="text-end py-3 px-4 text-sm font-semibold text-gray-700">
                      {t("web.provider.reports.pages.staff/performance.completed")}
                    </th>
                    <th className="text-end py-3 px-4 text-sm font-semibold text-gray-700">
                      {t("web.provider.reports.pages.staff/performance.ledgerNet")}
                    </th>
                    <th className="text-end py-3 px-4 text-sm font-semibold text-gray-700">
                      {t("web.provider.reports.pages.staff/performance.avgPerAppointment")}
                    </th>
                    <th className="text-end py-3 px-4 text-sm font-semibold text-gray-700">
                      {t("web.provider.reports.pages.staff/performance.rating")}
                    </th>
                    <th className="text-end py-3 px-4 text-sm font-semibold text-gray-700">
                      {t("web.provider.reports.pages.staff/performance.commission")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.staffMembers.map((staff, _index) => (
                    <tr
                      key={staff.staffId}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {staff.staffName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {t("web.provider.reports.pages.staff/performance.hours", { hours: staff.totalHours.toFixed(1) })}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {staff.commissionEnabled ? (
                              <Badge variant="secondary" className="text-[10px] font-normal">
                                {t("web.provider.reports.pages.staff/performance.commission")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                                {t("web.provider.reports.pages.staff/performance.noCommission")}
                              </Badge>
                            )}
                            {staff.tipsEnabled ? (
                              <Badge variant="secondary" className="text-[10px] font-normal">
                                {t("web.provider.settings.pages.team/commissions.tips")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                                {t("web.provider.reports.pages.staff/performance.noTips")}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="text-end py-3 px-4 text-sm text-gray-900">
                        {staff.totalBookings}
                      </td>
                      <td className="text-end py-3 px-4 text-sm text-gray-900">
                        <div className="flex items-center justify-end gap-1">
                          <span>{staff.completedBookings}</span>
                          {staff.cancelledBookings > 0 && (
                            <span className="text-xs text-red-600">
                              {t("web.provider.reports.pages.staff/performance.cancelledCount", { count: staff.cancelledBookings })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-end py-3 px-4 text-sm font-semibold text-gray-900">
                        {fmt(staff.totalRevenue)}
                      </td>
                      <td className="text-end py-3 px-4 text-sm text-gray-600">
                        {fmt(staff.averageBookingValue)}
                      </td>
                      <td className="text-end py-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                          <span className="text-sm text-gray-900">
                            {staff.averageRating.toFixed(1)}
                          </span>
                          <span className="text-xs text-gray-500">
                            ({staff.totalReviews})
                          </span>
                        </div>
                      </td>
                      <td className="text-end py-3 px-4 text-sm font-semibold text-green-600">
                        {fmt(staff.commissionEarned)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">{t("web.provider.reports.pages.staff/performance.detailByMember")}</CardTitle>
              <p className="text-sm font-normal text-gray-500">
                {t("web.provider.reports.pages.staff/performance.detailByMemberHint")}
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 text-center py-8">
                {t("web.provider.reports.pages.staff/performance.noStaffData")}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
