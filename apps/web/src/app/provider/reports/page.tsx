"use client";

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

const reportCategories = [
  {
    id: "sales",
    title: "Sales Reports",
    description: "Track revenue, bookings, and service performance",
    icon: DollarSign,
    color: "text-green-600 bg-green-50",
    reports: [
      { id: "sales-summary", name: "Sales Summary", href: "/provider/reports/sales/summary" },
      { id: "service-performance", name: "Service Performance", href: "/provider/reports/sales/services" },
      { id: "product-sales", name: "Product Sales", href: "/provider/reports/products/sales" },
      { id: "revenue-trends", name: "Revenue Trends", href: "/provider/reports/sales/trends" },
    ],
  },
  {
    id: "staff",
    title: "Staff Reports",
    description: "Monitor team member performance and productivity",
    icon: Users,
    color: "text-blue-600 bg-blue-50",
    reports: [
      { id: "staff-performance", name: "Staff Performance", href: "/provider/reports/staff/performance" },
      { id: "staff-commission", name: "Commission Reports", href: "/provider/reports/staff/commission" },
      { id: "staff-hours", name: "Hours & Attendance", href: "/provider/reports/staff/hours" },
    ],
  },
  {
    id: "bookings",
    title: "Booking Reports",
    description: "Analyze booking patterns and client behavior",
    icon: Calendar,
    color: "text-purple-600 bg-purple-50",
    reports: [
      { id: "booking-summary", name: "Booking Summary", href: "/provider/reports/bookings/summary" },
      { id: "booking-status", name: "Booking Status", href: "/provider/reports/bookings/status" },
      { id: "cancellations", name: "Cancellations", href: "/provider/reports/bookings/cancellations" },
      { id: "no-shows", name: "No-Shows", href: "/provider/reports/bookings/no-shows" },
    ],
  },
  {
    id: "clients",
    title: "Client Reports",
    description: "Understand your client base and retention",
    icon: Users,
    color: "text-pink-600 bg-pink-50",
    reports: [
      { id: "client-summary", name: "Client Summary", href: "/provider/reports/clients/summary" },
      { id: "client-retention", name: "Client Retention", href: "/provider/reports/clients/retention" },
      { id: "new-clients", name: "New Clients", href: "/provider/reports/clients/new" },
      { id: "client-lifetime-value", name: "Lifetime Value", href: "/provider/reports/clients/lifetime-value" },
    ],
  },
  {
    id: "payments",
    title: "Payment Reports",
    description: "Track payments, refunds, and financial transactions",
    icon: CreditCard,
    color: "text-orange-600 bg-orange-50",
    reports: [
      { id: "payment-summary", name: "Payment Summary", href: "/provider/reports/payments/summary" },
      { id: "refunds", name: "Refunds", href: "/provider/reports/payments/refunds" },
      { id: "payment-methods", name: "Payment Methods", href: "/provider/reports/payments/methods" },
      { id: "payouts", name: "Payouts", href: "/provider/reports/payments/payouts" },
    ],
  },
  {
    id: "products",
    title: "Product Reports",
    description: "Monitor product sales and inventory",
    icon: ShoppingBag,
    color: "text-indigo-600 bg-indigo-50",
    reports: [
      { id: "product-sales", name: "Product Sales", href: "/provider/reports/products/sales" },
      { id: "inventory", name: "Inventory", href: "/provider/reports/products/inventory" },
      { id: "top-products", name: "Top Products", href: "/provider/reports/products/top" },
    ],
  },
  {
    id: "gift-cards",
    title: "Gift Card Reports",
    description: "Track gift card sales and redemptions",
    icon: Gift,
    color: "text-rose-600 bg-rose-50",
    reports: [
      { id: "gift-card-sales", name: "Gift Card Sales", href: "/provider/reports/gift-cards/sales" },
      { id: "gift-card-redemptions", name: "Redemptions", href: "/provider/reports/gift-cards/redemptions" },
    ],
  },
  {
    id: "packages",
    title: "Package Reports",
    description: "Analyze package sales and usage",
    icon: Package,
    color: "text-cyan-600 bg-cyan-50",
    reports: [
      { id: "package-sales", name: "Package Sales", href: "/provider/reports/packages/sales" },
      { id: "package-usage", name: "Package Usage", href: "/provider/reports/packages/usage" },
    ],
  },
  {
    id: "business",
    title: "Business Reports",
    description: "Overall business performance and insights",
    icon: BarChart3,
    color: "text-violet-600 bg-violet-50",
    reports: [
      { id: "business-overview", name: "Business Overview", href: "/provider/reports/business/overview" },
      { id: "performance-dashboard", name: "Performance Dashboard", href: "/provider/reports/business/dashboard" },
      { id: "comparison", name: "Period Comparison", href: "/provider/reports/business/comparison" },
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
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  useEffect(() => {
    loadQuickStats();
  }, []);

  const loadQuickStats = async () => {
    try {
      setIsLoadingStats(true);
      // Get stats from business overview endpoint (more accurate than dashboard)
      const response = await fetcher.get<{ data: any }>("/api/provider/reports/business/overview?period=month");
      const overviewData = response.data;
      
      setQuickStats({
        totalRevenue: overviewData.totalRevenue || 0,
        totalBookings: overviewData.totalBookings || 0,
        activeClients: overviewData.uniqueClients || 0,
        growthRate: overviewData.revenueGrowth || 0,
      });
    } catch (err) {
      console.error("Error loading quick stats:", err);
      // Fallback to finance API if business overview fails
      try {
        const financeResponse = await fetcher.get<{ data: any }>("/api/provider/finance?range=month");
        const financeData = financeResponse.data?.earnings;
        setQuickStats({
          totalRevenue: financeData?.total_earnings || 0,
          totalBookings: 0, // Not available in finance API
          activeClients: 0,
          growthRate: financeData?.growth_percentage || 0,
        });
      } catch {
        // Silently handle subscription errors - don't show stats if subscription required
        setQuickStats({
          totalRevenue: 0,
          totalBookings: 0,
          activeClients: 0,
          growthRate: 0,
        });
      }
    } finally {
      setIsLoadingStats(false);
    }
  };

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Reports" },
      ]}
      showCloseButton={false}
    >
      <PageHeader
        title="Reports"
        subtitle="Comprehensive insights into your business performance"
      />

      <div className="space-y-6">
        {/* Quick Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {isLoadingStats ? (
                      <span className="text-gray-400">Loading...</span>
                    ) : (
                      `ZAR ${(quickStats?.totalRevenue || 0).toLocaleString()}`
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
                  <p className="text-sm text-gray-600 mb-1">Total Bookings</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {isLoadingStats ? (
                      <span className="text-gray-400">Loading...</span>
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
                  <p className="text-sm text-gray-600 mb-1">Active Clients</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {isLoadingStats ? (
                      <span className="text-gray-400">Loading...</span>
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
                  <p className="text-sm text-gray-600 mb-1">Growth Rate</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {isLoadingStats ? (
                      <span className="text-gray-400">Loading...</span>
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
                          {category.title}
                        </CardTitle>
                        <CardDescription className="text-sm text-gray-600 mt-1">
                          {category.description}
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
                        className="block p-3 rounded-lg border border-gray-200 hover:border-[#FF0077] hover:bg-pink-50 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 group-hover:text-[#FF0077]">
                            {report.name}
                          </span>
                          <FileText className="w-4 h-4 text-gray-400 group-hover:text-[#FF0077] transition-colors" />
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
