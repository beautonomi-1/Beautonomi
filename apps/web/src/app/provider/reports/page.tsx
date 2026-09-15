"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart3,
  DollarSign,
  Users,
  TrendingUp,
  Gift,
  Package,
  CreditCard,
  FileText,
  Calendar,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { fetcher } from "@/lib/http/fetcher";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { addLocationIdToUrl } from "@/app/provider/reports/utils/report-api-url";
import { useReportLocationQuery } from "@/app/provider/reports/utils/use-report-location-query";
import { REVENUE_GLOSSARY } from "@/lib/reports/revenue-glossary";
import { ActiveLocationChip } from "@/components/provider/ActiveLocationChip";

const reportCategories = [
  {
    id: "sales",
    icon: DollarSign,
    color: "text-green-600 bg-green-50",
    reports: [
      { id: "sales-summary", href: "/provider/reports/sales/summary" },
      { id: "service-performance", href: "/provider/reports/sales/services" },
      { id: "revenue-trends", href: "/provider/reports/sales/trends" },
    ],
  },
  {
    id: "staff",
    icon: Users,
    color: "text-blue-600 bg-blue-50",
    reports: [
      { id: "staff-performance", href: "/provider/reports/staff/performance" },
      { id: "staff-commission", href: "/provider/reports/staff/commission" },
      { id: "staff-hours", href: "/provider/reports/staff/hours" },
    ],
  },
  {
    id: "bookings",
    icon: Calendar,
    color: "text-purple-600 bg-purple-50",
    reports: [
      { id: "booking-summary", href: "/provider/reports/bookings/summary" },
      { id: "booking-status", href: "/provider/reports/bookings/status" },
      { id: "occupancy", href: "/provider/reports/occupancy" },
      { id: "cancellations", href: "/provider/reports/bookings/cancellations" },
      { id: "no-shows", href: "/provider/reports/bookings/no-shows" },
    ],
  },
  {
    id: "clients",
    icon: Users,
    color: "text-pink-600 bg-pink-50",
    reports: [
      { id: "client-summary", href: "/provider/reports/clients/summary" },
      { id: "client-retention", href: "/provider/reports/clients/retention" },
      { id: "new-clients", href: "/provider/reports/clients/new" },
      { id: "client-lifetime-value", href: "/provider/reports/clients/lifetime-value" },
    ],
  },
  {
    id: "payments",
    icon: CreditCard,
    color: "text-orange-600 bg-orange-50",
    reports: [
      { id: "payment-summary", href: "/provider/reports/payments/summary" },
      { id: "end-of-day", href: "/provider/reports/end-of-day" },
      { id: "refunds", href: "/provider/reports/payments/refunds" },
      { id: "payment-methods", href: "/provider/reports/payments/methods" },
      { id: "payouts", href: "/provider/reports/payments/payouts" },
      { id: "yoco-reconciliation", href: "/provider/reports/payments/yoco-reconciliation" },
      { id: "paystack-terminal-reconciliation", href: "/provider/reports/payments/paystack-terminal-reconciliation" },
    ],
  },
  {
    id: "products",
    icon: ShoppingBag,
    color: "text-indigo-600 bg-indigo-50",
    reports: [
      { id: "product-sales", href: "/provider/reports/products/sales" },
      { id: "inventory", href: "/provider/reports/products/inventory" },
      { id: "top-products", href: "/provider/reports/products/top" },
    ],
  },
  {
    id: "gift-cards",
    icon: Gift,
    color: "text-rose-600 bg-rose-50",
    reports: [
      { id: "gift-card-sales", href: "/provider/reports/gift-cards/sales" },
      { id: "gift-card-redemptions", href: "/provider/reports/gift-cards/redemptions" },
    ],
  },
  {
    id: "packages",
    icon: Package,
    color: "text-cyan-600 bg-cyan-50",
    reports: [
      { id: "packages-overview", href: "/provider/reports/packages" },
      { id: "package-sales", href: "/provider/reports/packages/sales" },
      { id: "package-usage", href: "/provider/reports/packages/usage" },
    ],
  },
  {
    id: "business",
    icon: BarChart3,
    color: "text-violet-600 bg-violet-50",
    reports: [
      { id: "business-overview", href: "/provider/reports/business/overview" },
      { id: "performance-dashboard", href: "/provider/reports/business/dashboard" },
      { id: "comparison", href: "/provider/reports/business/comparison" },
    ],
  },
];

interface QuickStats {
  totalRevenue: number;
  totalBookings: number;
  activeClients: number;
  growthRate: number;
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const { format: fmt } = useReportCurrency();
  const { selectedLocationId } = useReportLocationQuery();
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    loadQuickStats();
  }, [selectedLocationId]);

  const loadQuickStats = async () => {
    try {
      setIsLoadingStats(true);
      setStatsError(false);
      // Get stats from business overview endpoint (more accurate than dashboard)
      type BusinessOverviewData = { totalRevenue?: number; totalBookings?: number; uniqueClients?: number; revenueGrowth?: number };
      const response = await fetcher.get<{ data: BusinessOverviewData }>(
        addLocationIdToUrl("/api/provider/reports/business/overview?period=month", selectedLocationId),
        { timeoutMs: 120_000 },
      );
      const overviewData = response.data ?? {};
      setQuickStats({
        totalRevenue: overviewData.totalRevenue ?? 0,
        totalBookings: overviewData.totalBookings ?? 0,
        activeClients: overviewData.uniqueClients ?? 0,
        growthRate: overviewData.revenueGrowth ?? 0,
      });
    } catch (err) {
      console.error("Error loading quick stats:", err);
      try {
        type FinanceData = {
          earnings?: {
            recognized_revenue_total?: number;
            growth_percentage?: number;
          };
        };
        const financeResponse = await fetcher.get<{ data?: FinanceData }>(
          "/api/provider/finance?range=month",
          { timeoutMs: 120_000 },
        );
        const financeData = financeResponse.data?.earnings;
        setQuickStats({
          totalRevenue: financeData?.recognized_revenue_total || 0,
          totalBookings: 0, // Not available in finance API
          activeClients: 0,
          growthRate: financeData?.growth_percentage || 0,
        });
      } catch {
        // Both sources failed: surface an error instead of implying real zeros
        // (showing R0 earnings to an owner who actually traded is misleading).
        setQuickStats(null);
        setStatsError(true);
      }
    } finally {
      setIsLoadingStats(false);
    }
  };

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbDashboard"), href: "/provider/dashboard" },
        { label: t("web.provider.sidebar.items.reports") },
      ]}
      showCloseButton={false}
    >
      <PageHeader
        title={t("web.provider.sidebar.items.reports")}
        subtitle={t("web.provider.reports.hub.subtitle")}
      />

      <ActiveLocationChip className="mb-4" />

      <div className="space-y-6">
        {/* Quick Stats Cards */}
        {statsError ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-amber-900">
                {t("web.provider.reports.hub.statsError")}
              </p>
              <button
                type="button"
                onClick={loadQuickStats}
                className="inline-flex h-9 items-center justify-center rounded-md border border-amber-300 bg-white px-4 text-sm font-medium text-amber-900 hover:bg-amber-100"
              >
                {t("web.provider.common.tryAgain")}
              </button>
            </CardContent>
          </Card>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1" title={REVENUE_GLOSSARY.recognizedRevenue.definition}>{t("web.provider.reports.hub.ledgerEarningsMtd")}</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {isLoadingStats ? (
                      <span className="text-gray-400">{t("web.provider.reports.hub.loading")}</span>
                    ) : (
                      fmt(quickStats?.totalRevenue || 0)
                    )}
                  </p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">{t("web.provider.reports.hub.scheduledBookingsMtd")}</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {isLoadingStats ? (
                      <span className="text-gray-400">{t("web.provider.reports.hub.loading")}</span>
                    ) : (
                      (quickStats?.totalBookings || 0).toLocaleString()
                    )}
                  </p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <Calendar className="w-5 h-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">{t("web.provider.reports.hub.distinctClientsMtd")}</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {isLoadingStats ? (
                      <span className="text-gray-400">{t("web.provider.reports.hub.loading")}</span>
                    ) : (
                      (quickStats?.activeClients || 0).toLocaleString()
                    )}
                  </p>
                </div>
                <div className="p-3 bg-pink-50 rounded-lg">
                  <Users className="w-5 h-5 text-pink-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">{t("web.provider.reports.hub.ledgerGrowth")}</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {isLoadingStats ? (
                      <span className="text-gray-400">{t("web.provider.reports.hub.loading")}</span>
                    ) : (
                      `${(quickStats?.growthRate || 0) > 0 ? "+" : ""}${(quickStats?.growthRate || 0).toFixed(1)}%`
                    )}
                  </p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        )}

        {/* Report Categories */}
        <div className="space-y-6">
          {reportCategories.map((category) => {
            const Icon = category.icon;
            return (
              <Card key={category.id} className="border-gray-200 hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-lg ${category.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-semibold text-gray-900">
                          {t(`web.provider.reports.hub.${category.id}Title`)}
                        </CardTitle>
                        <CardDescription className="text-sm text-gray-600 mt-1">
                          {t(`web.provider.reports.hub.${category.id}Desc`)}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {category.reports.map((report) => (
                      <Link
                        key={report.id}
                        href={report.href}
                        className="block p-3 rounded-lg border border-gray-200 hover:border-primary hover:bg-pink-50 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 group-hover:text-primary">
                            {t(`web.provider.reports.hub.report.${report.id}`)}
                          </span>
                          <FileText className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </SettingsDetailLayout>
  );
}
