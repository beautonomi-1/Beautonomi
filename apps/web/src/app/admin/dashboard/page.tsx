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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  tips_total: number;
  taxes_total: number;
  gift_card_sales_total: number;
  membership_sales_total: number;
  refunds_total: number;
  gift_card_metrics?: {
    total_sales: number;
  };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

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
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading dashboard..." />
      </div>
    );
  }

  if (error || !stats) {
    return (
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
    );
  }

  return (
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
                          <p><strong>1. GMV (Gross Merchandise Value):</strong> Total transaction value before any deductions</p>
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
                          <p>Provider gets: R985 - R197 = R788</p>
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
                trend={stats.providers_growth !== 0 ? `${stats.providers_growth >= 0 ? '+' : ''}${stats.providers_growth}` : undefined}
              />
              <StatCard
                title="Total Bookings"
                value={stats.total_bookings.toLocaleString()}
                icon={<Calendar className="w-6 h-6" />}
                color="purple"
                trend={stats.bookings_growth !== 0 ? `${stats.bookings_growth >= 0 ? '+' : ''}${stats.bookings_growth}%` : undefined}
              />
              <StatCard
                title="Platform Take (Net)"
                value={`ZAR ${stats.platform_net_total.toLocaleString()}`}
                icon={<DollarSign className="w-6 h-6" />}
                color="orange"
                trend={stats.revenue_growth !== 0 ? `${stats.revenue_growth >= 0 ? '+' : ''}${stats.revenue_growth}%` : undefined}
                infoTooltip="Your actual platform revenue after deducting gateway fees. Formula: Commission (Net) - Gateway Fees. This is the money that stays with the platform."
              />
            </div>
          </motion.div>

          {/* Revenue Streams */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
            title="GMV (Services)"
            value={`ZAR ${stats.gmv_total.toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            color="purple"
          />
          <StatCard
            title="Commission (Gross)"
            value={`ZAR ${stats.platform_commission_gross_total.toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            color="orange"
          />
          <StatCard
            title="Gateway Fees"
            value={`ZAR ${stats.gateway_fees_total.toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            color="blue"
            infoTooltip="Total payment processing fees charged by payment gateways. These fees reduce your platform revenue (Platform Take = Commission - Gateway Fees). Gateway fees do not affect provider earnings."
          />
          <StatCard
            title="Refund Impact (Commission)"
            value={`ZAR ${stats.platform_refund_impact_total.toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            color="orange"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Subscription Revenue (Net)"
            value={`ZAR ${stats.subscription_net_total.toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            color="green"
          />
          <StatCard
            title="Tips (Gross)"
            value={`ZAR ${stats.tips_total.toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            color="purple"
          />
          <StatCard
            title="Taxes (Gross)"
            value={`ZAR ${stats.taxes_total.toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            color="blue"
          />
          <StatCard
            title="Gift Card Sales"
            value={`ZAR ${stats.gift_card_sales_total.toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            color="green"
          />
          <StatCard
            title="Membership Sales"
            value={`ZAR ${stats.membership_sales_total.toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            color="blue"
          />
          <StatCard
            title="Refunds"
            value={`ZAR ${stats.refunds_total.toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            color="orange"
          />
        </div>

        {/* Gift Card Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
          className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-8"
        >
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="w-6 h-6 text-[#FF0077]" />
              <h2 className="text-2xl font-semibold tracking-tighter text-gray-900">
                Gift Card Metrics
              </h2>
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
                <PopoverContent className="w-96 max-h-[80vh] overflow-y-auto backdrop-blur-xl bg-white/95 border border-white/40 shadow-xl">
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-gray-900">Gift Card Accounting</h3>
                    <div className="text-xs text-gray-600 space-y-2">
                      <p><strong>Sales:</strong> Cash received when customers purchase gift cards. This is a liability (platform owes services).</p>
                      <p><strong>Redemptions:</strong> Value of gift cards used in bookings. Revenue is recognized via platform commission on those bookings.</p>
                      <p><strong>Outstanding Liability:</strong> Unredeemed gift card balance (cash received but services not yet delivered).</p>
                      <p className="text-[#FF0077] font-medium">Note: Gift card sales are NOT revenue until redeemed via bookings.</p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-sm font-light text-gray-600">Sales, redemptions, and liability tracking</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Total Sales</p>
                <DollarSign className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-2xl font-semibold">
                ZAR {stats.gift_card_sales_total.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">Cash received (liability)</p>
            </div>
            <div className="bg-white border rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">View Full Report</p>
                <Gift className="w-5 h-5 text-gray-400" />
              </div>
              <a
                href="/admin/reports/gift-cards"
                className="text-[#FF0077] font-medium hover:underline text-sm"
              >
                Gift Card Report →
              </a>
              <p className="text-xs text-gray-500 mt-1">Detailed metrics & trends</p>
            </div>
            <div className="bg-white border rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Manage Gift Cards</p>
                <Gift className="w-5 h-5 text-gray-400" />
              </div>
              <a
                href="/admin/gift-cards"
                className="text-[#FF0077] font-medium hover:underline text-sm"
              >
                Gift Card Management →
              </a>
              <p className="text-xs text-gray-500 mt-1">Create, edit, view cards</p>
            </div>
          </div>
        </motion.div>

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
              ZAR {stats.revenue_today.toLocaleString()}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">This Month</p>
              <TrendingUp className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold">
              ZAR {stats.revenue_this_month.toLocaleString()}
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
