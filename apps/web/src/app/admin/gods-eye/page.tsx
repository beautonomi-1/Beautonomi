"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import {
  Users,
  Building2,
  Calendar,
  DollarSign,
  Eye,
  Activity,
  MapPin,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Search,
  Download,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GodsEyeData {
  overview: {
    total_users: number;
    total_providers: number;
    total_bookings: number;
    total_revenue: number;
    active_bookings: number;
    pending_approvals: number;
    house_call_bookings: number;
    salon_bookings: number;
  };
  recent_activity: Array<{
    id: string;
    type: "booking" | "user" | "provider" | "payment" | "verification";
    action: string;
    entity_id: string;
    entity_name: string;
    timestamp: string;
    status?: string;
  }>;
  bookings_by_status: {
    confirmed: number;
    pending: number;
    cancelled: number;
    completed: number;
  };
  bookings_by_type: {
    at_home: number;
    at_salon: number;
  };
  revenue_breakdown: {
    today: number;
    this_week: number;
    this_month: number;
    all_time: number;
  };
  top_providers: Array<{
    id: string;
    name: string;
    bookings_count: number;
    revenue: number;
    rating: number;
  }>;
  top_customers: Array<{
    id: string;
    name: string;
    bookings_count: number;
    total_spent: number;
  }>;
  system_health: {
    api_uptime: number;
    database_status: string;
    payment_gateway_status: string;
    notification_service_status: string;
  };
}

export default function GodsEyePage() {
  const [data, setData] = useState<GodsEyeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadData();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: GodsEyeData }>(
        "/api/admin/gods-eye",
        { timeoutMs: 30000 }
      );
      setData(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load Gods Eye data";
      setError(errorMessage);
      console.error("Error loading Gods Eye data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredActivity = data?.recent_activity.filter((activity) => {
    if (filterType !== "all" && activity.type !== filterType) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        activity.action.toLowerCase().includes(query) ||
        activity.entity_name.toLowerCase().includes(query) ||
        activity.entity_id.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const generateCSVExport = () => {
    if (!data) return "";
    
    const rows: string[] = [];
    
    // Header
    rows.push("Gods Eye Export");
    rows.push(`Generated: ${new Date().toISOString()}`);
    rows.push("");
    
    // Overview
    rows.push("OVERVIEW");
    rows.push("Metric,Value");
    rows.push(`Total Users,${data.overview.total_users}`);
    rows.push(`Total Providers,${data.overview.total_providers}`);
    rows.push(`Total Bookings,${data.overview.total_bookings}`);
    rows.push(`Total Revenue,${data.overview.total_revenue}`);
    rows.push(`Active Bookings,${data.overview.active_bookings}`);
    rows.push(`Pending Approvals,${data.overview.pending_approvals}`);
    rows.push(`House Call Bookings,${data.overview.house_call_bookings}`);
    rows.push(`Salon Bookings,${data.overview.salon_bookings}`);
    rows.push("");
    
    // Bookings by Status
    rows.push("BOOKINGS BY STATUS");
    rows.push("Status,Count");
    rows.push(`Confirmed,${data.bookings_by_status.confirmed}`);
    rows.push(`Pending,${data.bookings_by_status.pending}`);
    rows.push(`Completed,${data.bookings_by_status.completed}`);
    rows.push(`Cancelled,${data.bookings_by_status.cancelled}`);
    rows.push("");
    
    // Bookings by Type
    rows.push("BOOKINGS BY TYPE");
    rows.push("Type,Count");
    rows.push(`At Home,${data.bookings_by_type.at_home}`);
    rows.push(`At Salon,${data.bookings_by_type.at_salon}`);
    rows.push("");
    
    // Revenue Breakdown
    rows.push("REVENUE BREAKDOWN");
    rows.push("Period,Amount (ZAR)");
    rows.push(`Today,${data.revenue_breakdown.today}`);
    rows.push(`This Week,${data.revenue_breakdown.this_week}`);
    rows.push(`This Month,${data.revenue_breakdown.this_month}`);
    rows.push(`All Time,${data.revenue_breakdown.all_time}`);
    rows.push("");
    
    // Top Providers
    rows.push("TOP PROVIDERS");
    rows.push("Name,Bookings,Revenue,Rating");
    data.top_providers.forEach((p) => {
      rows.push(`${p.name},${p.bookings_count},${p.revenue},${p.rating}`);
    });
    rows.push("");
    
    // Top Customers
    rows.push("TOP CUSTOMERS");
    rows.push("Name,Bookings,Total Spent");
    data.top_customers.forEach((c) => {
      rows.push(`${c.name},${c.bookings_count},${c.total_spent}`);
    });
    rows.push("");
    
    // Recent Activity
    rows.push("RECENT ACTIVITY");
    rows.push("Type,Action,Entity Name,Status,Timestamp");
    filteredActivity?.forEach((a) => {
      rows.push(`${a.type},${a.action},${a.entity_name},${a.status || "N/A"},${a.timestamp}`);
    });
    
    return rows.join("\n");
  };

  if (isLoading && !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading Gods Eye view..." />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Failed to load Gods Eye"
          description={error}
          action={{
            label: "Retry",
            onClick: loadData,
          }}
        />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Eye className="w-8 h-8 text-pink-600" />
              <h1 className="text-3xl font-semibold">Gods Eye</h1>
            </div>
            <p className="text-gray-600">
              Comprehensive real-time view of all platform activity
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="auto-refresh" className="text-sm text-gray-600">
                Auto-refresh
              </label>
            </div>
            {autoRefresh && (
              <Select
                value={refreshInterval.toString()}
                onValueChange={(v) => setRefreshInterval(Number(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10s</SelectItem>
                  <SelectItem value="30">30s</SelectItem>
                  <SelectItem value="60">1min</SelectItem>
                  <SelectItem value="300">5min</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button
              onClick={() => {
                const csv = generateCSVExport();
                const blob = new Blob([csv], { type: "text/csv" });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `gods-eye-export-${new Date().toISOString().split("T")[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              }}
              variant="outline"
              size="sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={loadData} variant="outline" size="sm">
              <Activity className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <OverviewCard
            title="Total Users"
            value={data?.overview.total_users || 0}
            icon={<Users className="w-6 h-6" />}
            color="blue"
          />
          <OverviewCard
            title="Total Providers"
            value={data?.overview.total_providers || 0}
            icon={<Building2 className="w-6 h-6" />}
            color="green"
          />
          <OverviewCard
            title="Total Bookings"
            value={data?.overview.total_bookings || 0}
            icon={<Calendar className="w-6 h-6" />}
            color="purple"
          />
          <OverviewCard
            title="Total Revenue"
            value={`ZAR ${(data?.overview.total_revenue || 0).toLocaleString()}`}
            icon={<DollarSign className="w-6 h-6" />}
            color="orange"
          />
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Active Bookings"
            value={data?.overview.active_bookings || 0}
            icon={<Clock className="w-5 h-5" />}
          />
          <MetricCard
            title="House Call Bookings"
            value={data?.overview.house_call_bookings || 0}
            icon={<MapPin className="w-5 h-5" />}
          />
          <MetricCard
            title="Salon Bookings"
            value={data?.overview.salon_bookings || 0}
            icon={<Building2 className="w-5 h-5" />}
          />
          <MetricCard
            title="Pending Approvals"
            value={data?.overview.pending_approvals || 0}
            icon={<AlertCircle className="w-5 h-5" />}
            variant="warning"
          />
        </div>

        {/* Bookings Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Bookings by Status</h3>
            <div className="space-y-3">
              <StatusBar
                label="Confirmed"
                value={data?.bookings_by_status.confirmed || 0}
                color="green"
              />
              <StatusBar
                label="Pending"
                value={data?.bookings_by_status.pending || 0}
                color="yellow"
              />
              <StatusBar
                label="Completed"
                value={data?.bookings_by_status.completed || 0}
                color="blue"
              />
              <StatusBar
                label="Cancelled"
                value={data?.bookings_by_status.cancelled || 0}
                color="red"
              />
            </div>
          </div>

          <div className="bg-white border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Bookings by Type</h3>
            <div className="space-y-3">
              <StatusBar
                label="At Home (House Call)"
                value={data?.bookings_by_type.at_home || 0}
                color="purple"
              />
              <StatusBar
                label="At Salon"
                value={data?.bookings_by_type.at_salon || 0}
                color="orange"
              />
            </div>
          </div>
        </div>

        {/* Revenue Breakdown */}
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Revenue Breakdown</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <RevenueCard
              period="Today"
              amount={data?.revenue_breakdown.today || 0}
            />
            <RevenueCard
              period="This Week"
              amount={data?.revenue_breakdown.this_week || 0}
            />
            <RevenueCard
              period="This Month"
              amount={data?.revenue_breakdown.this_month || 0}
            />
            <RevenueCard
              period="All Time"
              amount={data?.revenue_breakdown.all_time || 0}
            />
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">System Health</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <HealthIndicator
              label="API Uptime"
              value={`${data?.system_health.api_uptime || 0}%`}
              status="healthy"
            />
            <HealthIndicator
              label="Database"
              value={data?.system_health.database_status || "Unknown"}
              status={
                data?.system_health.database_status === "operational"
                  ? "healthy"
                  : "warning"
              }
            />
            <HealthIndicator
              label="Payment Gateway"
              value={data?.system_health.payment_gateway_status || "Unknown"}
              status={
                data?.system_health.payment_gateway_status === "operational"
                  ? "healthy"
                  : "warning"
              }
            />
            <HealthIndicator
              label="Notifications"
              value={data?.system_health.notification_service_status || "Unknown"}
              status={
                data?.system_health.notification_service_status === "operational"
                  ? "healthy"
                  : "warning"
              }
            />
          </div>
        </div>

        {/* Top Providers & Customers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Top Providers</h3>
            <div className="space-y-3">
              {data?.top_providers.slice(0, 5).map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{provider.name}</p>
                    <p className="text-sm text-gray-600">
                      {provider.bookings_count} bookings • Rating: {provider.rating}
                    </p>
                  </div>
                  <p className="font-semibold text-green-600">
                    ZAR {provider.revenue.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Top Customers</h3>
            <div className="space-y-3">
              {data?.top_customers.slice(0, 5).map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{customer.name}</p>
                    <p className="text-sm text-gray-600">
                      {customer.bookings_count} bookings
                    </p>
                  </div>
                  <p className="font-semibold text-blue-600">
                    ZAR {customer.total_spent.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Recent Activity</h3>
            <div className="flex items-center gap-3">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="booking">Bookings</SelectItem>
                  <SelectItem value="user">Users</SelectItem>
                  <SelectItem value="provider">Providers</SelectItem>
                  <SelectItem value="payment">Payments</SelectItem>
                  <SelectItem value="verification">Verifications</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search activity..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
            </div>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredActivity && filteredActivity.length > 0 ? (
              filteredActivity.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                No activity found
              </div>
            )}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

function OverviewCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: "blue" | "green" | "purple" | "orange";
}) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>{icon}</div>
      </div>
      <h3 className="text-2xl font-semibold mb-1">{value}</h3>
      <p className="text-sm text-gray-600">{title}</p>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
  variant = "default",
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  variant?: "default" | "warning";
}) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
        <div
          className={`p-2 rounded-lg ${
            variant === "warning"
              ? "bg-yellow-50 text-yellow-600"
              : "bg-gray-50 text-gray-600"
          }`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function StatusBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "green" | "yellow" | "blue" | "red" | "purple" | "orange";
}) {
  const colorClasses = {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    blue: "bg-blue-500",
    red: "bg-red-500",
    purple: "bg-purple-500",
    orange: "bg-orange-500",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm font-semibold">{value}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${colorClasses[color]}`}
          style={{ width: `${Math.min((value / 100) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

function RevenueCard({ period, amount }: { period: string; amount: number }) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <p className="text-sm text-gray-600 mb-2">{period}</p>
      <p className="text-xl font-semibold">ZAR {amount.toLocaleString()}</p>
    </div>
  );
}

function HealthIndicator({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "healthy" | "warning" | "error";
}) {
  const statusIcon = {
    healthy: <CheckCircle className="w-5 h-5 text-green-600" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-600" />,
    error: <XCircle className="w-5 h-5 text-red-600" />,
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      {statusIcon[status]}
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-600">{value}</p>
      </div>
    </div>
  );
}

function ActivityItem({
  activity,
}: {
  activity: {
    type: string;
    action: string;
    entity_name: string;
    timestamp: string;
    status?: string;
  };
}) {
  const typeIcons = {
    booking: <Calendar className="w-4 h-4" />,
    user: <Users className="w-4 h-4" />,
    provider: <Building2 className="w-4 h-4" />,
    payment: <DollarSign className="w-4 h-4" />,
    verification: <CheckCircle className="w-4 h-4" />,
  };

  const typeColors = {
    booking: "bg-blue-50 text-blue-600",
    user: "bg-green-50 text-green-600",
    provider: "bg-purple-50 text-purple-600",
    payment: "bg-orange-50 text-orange-600",
    verification: "bg-pink-50 text-pink-600",
  };

  return (
    <div className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
      <div
        className={`p-2 rounded-lg ${
          typeColors[activity.type as keyof typeof typeColors] || "bg-gray-50"
        }`}
      >
        {typeIcons[activity.type as keyof typeof typeIcons] || (
          <Activity className="w-4 h-4" />
        )}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{activity.action}</p>
        <p className="text-xs text-gray-600">
          {activity.entity_name} •{" "}
          {new Date(activity.timestamp).toLocaleString()}
        </p>
      </div>
      {activity.status && (
        <Badge
          variant={
            activity.status === "success" || activity.status === "completed"
              ? "default"
              : activity.status === "pending"
              ? "secondary"
              : "destructive"
          }
        >
          {activity.status}
        </Badge>
      )}
    </div>
  );
}
