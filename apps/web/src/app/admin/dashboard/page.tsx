"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users,
  Building2,
  Calendar,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Info,
  Gift,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { useAuth } from "@/providers/AuthProvider";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import RoleGuard from "@/components/auth/RoleGuard";

interface DashboardStats {
  total_users: number;
  total_providers: number;
  total_bookings: number;
  total_revenue: number;
  pending_approvals: number;
  active_bookings_today: number;
  revenue_today: number;
  revenue_this_month: number;
  revenue_growth: number;
  users_growth: number;
  providers_growth: number;
  bookings_growth: number;
  gmv_total: number;
  platform_net_total: number;
  platform_commission_gross_total: number;
  platform_refund_impact_total: number;
  gateway_fees_total: number;
  subscription_net_total: number;
  subscription_gateway_fees_total: number;
  ads_net_total?: number;
  tips_total: number;
  taxes_total: number;
  gift_card_sales_total: number;
  membership_sales_total: number;
  refunds_total: number;
  provider_earnings_total?: number;
  provider_earnings_this_month?: number;
  platform_revenue?: {
    booking_commission: number;
    subscriptions: number;
    ads: number;
    service_fees: number;
    ecommerce_fees_detail?: number;
    wallet_topups?: number;
    total: number;
  };
  provider_revenue?: {
    provider_earnings: number;
    cancellation_fees: number;
    tips: number;
    this_month: number;
  };
  gift_card_metrics?: {
    total_sales: number;
  };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, role } = useAuth();
  const { format: fmtMoney } = useReportCurrency();

  useEffect(() => {
    if (user?.id && role === "superadmin") {
      loadDashboard();
    } else if (role != null && role !== "superadmin") {
      setIsLoading(false);
    }
  }, [user?.id, role]);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: DashboardStats }>(
        "/api/admin/dashboard",
        { timeoutMs: 30000 } // 30 second timeout for dashboard (it does a lot of queries)
      );
      setStats(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load dashboard";
      setError(errorMessage);
      console.error("Error loading dashboard:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading dashboard..." />
        </div>
      </RoleGuard>
    );
  }

  if (error || !stats) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
        <div className="container mx-auto px-4 py-8">
          <EmptyState
          title="Failed to load dashboard"
          description={error || "Unable to load dashboard data"}
          action={{
            label: "Retry",
            onClick: loadDashboard,
          }}
        />
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
    <div className="container mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-8"
          >
            <div className="mb-8">
              <div className="flex items-start gap-2 mb-2">
                <motion.h1
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
                  className="text-3xl md:text-4xl font-semibold tracking-tighter text-gray-900"
                >
                  Admin Dashboard
                </motion.h1>
                <Popover>
                  <PopoverTrigger asChild>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="mt-1 text-gray-400 hover:text-[#FF0077] transition-colors"
                    >
                      <Info className="w-5 h-5" />
                    </motion.button>
                  </PopoverTrigger>
                  <PopoverContent className="w-96 max-h-[80vh] overflow-y-auto backdrop-blur-xl bg-white/95 border border-white/40 shadow-xl">
                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm text-gray-900">Revenue Calculation Overview</h3>
                      
                      <div>
                        <h4 className="font-medium text-xs mb-1 text-gray-700">Revenue Flow:</h4>
                        <div className="text-xs text-gray-600 space-y-1">
                          <p><strong>1. Settled service GMV:</strong> Ledger-backed service, wallet, gift-card, tax, tip, travel, platform-fee, and additional-charge activity</p>
                          <p><strong>2. Gateway Fees:</strong> Payment processing fees (deducted from platform revenue)</p>
                          <p><strong>3. Commission (Gross):</strong> Platform&apos;s % share of revenue</p>
                          <p><strong>4. Platform Take (Net):</strong> Commission - Gateway Fees = Your actual revenue</p>
                        </div>
                      </div>

                      <div className="bg-pink-50 p-2 rounded-lg border border-pink-200">
                        <p className="text-xs font-medium text-[#FF0077] mb-1">Quick Example:</p>
                        <div className="text-xs text-gray-700 space-y-0.5">
                          <p>R1,000 booking → Gateway Fee: R15 → Net: R985</p>
                          <p>20% Commission: R197 → Platform Take: R197 - R15 = R182</p>
                          <p>Provider earnings come from net provider_earnings ledger rows.</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-gray-600">
                          <strong>Note:</strong> Gateway fees are deducted from platform revenue only, 
                          not from provider earnings. This ensures providers receive their full commission share.
                        </p>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <p className="text-sm md:text-base font-light text-gray-600">Overview of platform metrics and activity</p>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard
                title="Total Users"
                value={stats.total_users.toLocaleString()}
                icon={<Users className="w-6 h-6" />}
                color="blue"
                trend={stats.users_growth !== 0 ? `${stats.users_growth >= 0 ? '+' : ''}${stats.users_growth}%` : undefined}
              />
              <StatCard
                title="Total Providers"
                value={stats.total_providers.toLocaleString()}
                icon={<Building2 className="w-6 h-6" />}
                color="green"
                trend={stats.providers_growth !== 0 ? `${stats.providers_growth >= 0 ? '+' : ''}${stats.providers_growth}%` : undefined}
              />
              <StatCard
                title="Total Bookings"
                value={stats.total_bookings.toLocaleString()}
                icon={<Calendar className="w-6 h-6" />}
                color="purple"
                trend={stats.bookings_growth !== 0 ? `${stats.bookings_growth >= 0 ? '+' : ''}${stats.bookings_growth}%` : undefined}
              />
              <StatCard
                title="Platform net (ledger + topups)"
                value={fmtMoney(stats.platform_net_total)}
                icon={<DollarSign className="w-6 h-6" />}
                color="orange"
                trend={stats.revenue_growth !== 0 ? `${stats.revenue_growth >= 0 ? '+' : ''}${stats.revenue_growth}%` : undefined}
                infoTooltip="Matches finance summary platform revenue: booking take + subscriptions + ads + Platform Fees + paid wallet topups. Rolling ledger window for ledger-backed lines (see API metrics_notes)."
              />
            </div>
          </motion.div>

          {/* Platform vs Provider Revenue */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
          >
            {/* Platform Revenue */}
            <div className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-pink-50 rounded-lg border border-pink-100">
                  <DollarSign className="w-5 h-5 text-[#FF0077]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Platform Revenue</h2>
                  <p className="text-xs text-gray-500">How Beautonomi makes money</p>
                </div>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-4">
                {fmtMoney(stats.platform_net_total)}
              </div>
              <div className="space-y-2">
                <RevenueRow label="Booking Commission" value={fmtMoney(stats.platform_revenue?.booking_commission ?? stats.platform_net_total - stats.subscription_net_total - (stats.ads_net_total ?? 0))} />
                <RevenueRow label="Provider Subscriptions" value={fmtMoney(stats.subscription_net_total)} />
                <RevenueRow label="Ads Revenue" value={fmtMoney(stats.ads_net_total ?? 0)} />
                <RevenueRow label="Platform Fees" value={fmtMoney(stats.platform_revenue?.service_fees ?? 0)} />
                <RevenueRow label="Wallet topups (paid)" value={fmtMoney(stats.platform_revenue?.wallet_topups ?? 0)} />
                <RevenueRow label="E-commerce Fees (in commission)" value={fmtMoney(stats.platform_revenue?.ecommerce_fees_detail ?? 0)} muted />
                
                <div className="border-t pt-2 mt-2">
                  <RevenueRow label="Gateway Fees (deducted)" value={`-${fmtMoney(stats.gateway_fees_total)}`} muted />
                  <RevenueRow label="Refund Impact" value={fmtMoney(stats.platform_refund_impact_total)} muted />
                </div>
              </div>
            </div>

            {/* Provider Revenue */}
            <div className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-green-50 rounded-lg border border-green-100">
                  <Building2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Provider Revenue</h2>
              <p className="text-xs text-gray-500">Provider earnings and pass-through ledger activity</p>
                </div>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-4">
                {fmtMoney(stats.provider_earnings_total ?? 0)}
              </div>
              <div className="space-y-2">
                <RevenueRow label="Service Earnings (net)" value={fmtMoney(stats.provider_earnings_total ?? 0)} />
                <RevenueRow label="Cancellation Fees" value={fmtMoney(stats.provider_revenue?.cancellation_fees ?? 0)} />
                <RevenueRow label="Tips Collected" value={fmtMoney(stats.tips_total)} />
                <RevenueRow label="Taxes Collected (pass-through)" value={fmtMoney(stats.taxes_total)} muted />
                <div className="border-t pt-2 mt-2">
                  <RevenueRow label="Refunds Given" value={`-${fmtMoney(stats.refunds_total)}`} muted />
                </div>
              </div>
              <div className="mt-4 pt-3 border-t">
                <p className="text-xs text-gray-500">This month: <span className="font-semibold text-gray-700">{fmtMoney(stats.provider_earnings_this_month ?? 0)}</span></p>
              </div>
            </div>
          </motion.div>

          {/* GMV & Transaction Flow */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Settled Service GMV"
              value={fmtMoney(stats.gmv_total)}
              icon={<DollarSign className="w-6 h-6" />}
              color="purple"
              infoTooltip="Ledger-backed service GMV. Provider reports show scheduled gross booked value separately."
            />
            <StatCard
              title="Commission (Gross)"
              value={fmtMoney(stats.platform_commission_gross_total)}
              icon={<DollarSign className="w-6 h-6" />}
              color="orange"
            />
            <StatCard
              title="Membership Sales"
              value={fmtMoney(stats.membership_sales_total)}
              icon={<DollarSign className="w-6 h-6" />}
              color="blue"
            />
            <StatCard
              title="Refunds (Gross)"
              value={fmtMoney(stats.refunds_total)}
              icon={<DollarSign className="w-6 h-6" />}
              color="red"
            />
          </div>

          {/* Gift Cards — NOT revenue */}
          <div className="backdrop-blur-xl bg-amber-50/50 border border-amber-200/60 rounded-2xl p-5 mb-8">
            <div className="flex items-center gap-3 mb-3">
              <Gift className="w-5 h-5 text-amber-600" />
              <h3 className="font-semibold text-gray-900">Gift Cards</h3>
              <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">LIABILITY — NOT REVENUE</span>
            </div>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-sm text-gray-500">Total Sold</p>
                <p className="text-xl font-semibold">{fmtMoney(stats.gift_card_sales_total)}</p>
                <p className="text-[10px] text-gray-400">Cash received (owed until redeemed)</p>
              </div>
              <div className="flex items-center gap-4">
                <Link href="/admin/reports/gift-cards" className="text-sm text-[#FF0077] hover:underline font-medium">View Report →</Link>
                <Link href="/admin/gift-cards" className="text-sm text-[#FF0077] hover:underline font-medium">Manage →</Link>
              </div>
            </div>
          </div>

        {/* Today's Activity */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white border rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Today&apos;s Bookings</p>
              <Calendar className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold">{stats.active_bookings_today}</p>
          </div>
          <div className="bg-white border rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Today&apos;s Revenue</p>
              <DollarSign className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold">
              {fmtMoney(stats.revenue_today)}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">This Month</p>
              <TrendingUp className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold">
              {fmtMoney(stats.revenue_this_month)}
            </p>
          </div>
        </div>

        {/* Alerts */}
        {stats.pending_approvals > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-yellow-600" />
              <div>
                <p className="font-semibold text-yellow-900">
                  {stats.pending_approvals} Provider Approval{stats.pending_approvals !== 1 ? "s" : ""} Pending
                </p>
                <p className="text-sm text-yellow-700">
                  Review and approve new provider applications
                </p>
              </div>
              <div className="ml-auto">
                <Link
                  href="/admin/providers?status=pending"
                  className="text-yellow-900 font-medium hover:underline"
                >
                  Review →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <QuickActionCard
            title="Manage Providers"
            description="Approve, verify, or suspend providers"
            link="/admin/providers"
            icon={<Building2 />}
          />
          <QuickActionCard
            title="View Bookings"
            description="Monitor all platform bookings"
            link="/admin/bookings"
            icon={<Calendar />}
          />
          <QuickActionCard
            title="Catalog Management"
            description="Manage categories and services"
            link="/admin/catalog"
            icon={<TrendingUp />}
          />
          <QuickActionCard
            title="System Settings"
            description="Configure platform settings"
            link="/admin/settings"
            icon={<AlertCircle />}
          />
        </div>
      </div>
    </RoleGuard>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
  trend,
  infoTooltip,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: "blue" | "green" | "purple" | "orange" | "red";
  trend?: string;
  infoTooltip?: string;
}) {
  const colorClasses = {
    blue: "bg-blue-50/80 text-blue-600 border-blue-100",
    green: "bg-green-50/80 text-green-600 border-green-100",
    purple: "bg-purple-50/80 text-purple-600 border-purple-100",
    orange: "bg-orange-50/80 text-orange-600 border-orange-100",
    red: "bg-red-50/80 text-red-600 border-red-100",
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 shadow-lg"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg border ${colorClasses[color]}`}>{icon}</div>
        <div className="flex items-center gap-2">
          {trend && (
            <span className={`text-sm font-semibold ${
              trend.startsWith('+') ? 'text-green-600' : 'text-red-600'
            }`}>{trend}</span>
          )}
          {infoTooltip && (
            <Popover>
              <PopoverTrigger asChild>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="text-gray-400 hover:text-[#FF0077] transition-colors"
                >
                  <Info className="w-4 h-4" />
                </motion.button>
              </PopoverTrigger>
              <PopoverContent className="w-72 backdrop-blur-xl bg-white/95 border border-white/40 shadow-xl">
                <p className="text-xs text-gray-600">{infoTooltip}</p>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      <h3 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1 text-gray-900">{value}</h3>
      <p className="text-sm font-light text-gray-600">{title}</p>
    </motion.div>
  );
}

function RevenueRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? "text-gray-400" : "text-gray-600"}>{label}</span>
      <span className={muted ? "text-gray-400 font-medium" : "font-semibold text-gray-900"}>{value}</span>
    </div>
  );
}

function QuickActionCard({
  title,
  description,
  link,
  icon,
}: {
  title: string;
  description: string;
  link: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.a
      href={link}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer">
        <div className="flex items-center gap-4 mb-3">
          <div className="p-3 bg-pink-50/80 rounded-lg text-[#FF0077] border border-pink-100">{icon}</div>
          <h3 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h3>
        </div>
        <p className="text-sm font-light text-gray-600">{description}</p>
      </div>
    </motion.a>
  );
}
