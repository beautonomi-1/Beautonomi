"use client";

import React, { useState, useEffect, useCallback } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  MapPin,
  Building2,
  Users,
  Smartphone,
  Monitor,
  Search,
  ArrowLeft,
  TrendingUp,
  Home,
  Store,
} from "lucide-react";
import Link from "next/link";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

type GeoPeriod = "30d" | "90d" | "1y" | "all";

interface GeoData {
  period?: string;
  booking_window_note?: string;
  summary: {
    total_provider_locations: number;
    unique_providers: number;
    total_customer_addresses: number;
    unique_customers: number;
    provider_cities: number;
    customer_cities: number;
    total_devices: number;
    active_devices_30d: number;
  };
  providers_by_city: Array<{
    city: string;
    count: number;
    active: number;
    lat: number;
    lng: number;
  }>;
  providers_by_postal: Array<{
    postal_code: string;
    count: number;
    city: string;
  }>;
  customers_by_city: Array<{
    city: string;
    count: number;
    lat: number;
    lng: number;
  }>;
  customers_by_postal: Array<{
    postal_code: string;
    count: number;
    city: string;
  }>;
  bookings_by_city: Array<{
    city: string;
    count: number;
    value: number;
    at_home: number;
    at_salon: number;
  }>;
  booking_value: {
    total: number;
    at_home: { count: number; value: number };
    at_salon: { count: number; value: number };
    avg_booking_value: number;
  };
  device_platforms: Array<{
    platform: string;
    total: number;
    customer: number;
    provider: number;
  }>;
}

const PLATFORM_COLORS: Record<string, string> = {
  ios: "#007AFF",
  android: "#3DDC84",
  web: "#FF6B35",
  huawei: "#C7112B",
};

const CHART_COLORS = [
  "#FF0077",
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

export default function GeoAnalyticsPage() {
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerSearch, setProviderSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [geoTab, setGeoTab] = useState("geography");
  const [period, setPeriod] = useState<GeoPeriod>("all");
  const { format: fmtMoney } = useReportCurrency();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetcher.get<{ data: GeoData }>(
        `/api/admin/analytics/geo?period=${period}`,
        { timeoutMs: 30000 }
      );
      setData(res.data);
    } catch {
      setError("Failed to load geographic analytics");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading && !data) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading geographic analytics..." />
        </div>
      </RoleGuard>
    );
  }

  if (error || !data) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Failed to load"
            description={error || "Unable to load geographic analytics"}
            action={{ label: "Retry", onClick: loadData }}
          />
        </div>
      </RoleGuard>
    );
  }

  const filteredProviderCities = data.providers_by_city.filter(
    (c) =>
      !providerSearch ||
      c.city.toLowerCase().includes(providerSearch.toLowerCase())
  );

  const filteredCustomerCities = data.customers_by_city.filter(
    (c) =>
      !customerSearch ||
      c.city.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const topProviderCities = data.providers_by_city.slice(0, 10);
  const topCustomerCities = data.customers_by_city.slice(0, 10);
  const topBookingCities = data.bookings_by_city.slice(0, 10);

  const totalDevices = data.device_platforms.reduce(
    (s, d) => s + d.total,
    0
  );

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="container mx-auto px-4 py-8 max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/analytics">
              <ArrowLeft className="h-4 w-4 mr-1" /> Analytics
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              Geographic & Device Analytics
            </h1>
            <p className="text-sm text-gray-500">
              Understand where your providers and customers are, and how they
              access the platform
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Select
              value={period}
              onValueChange={(v) => setPeriod(v as GeoPeriod)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-gray-400 max-w-[220px] sm:text-right">
              Window applies to booking counts &amp; value. Locations are current footprint.
            </p>
          </div>
        </div>

        {/* KPI Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <KpiCard
            title="Provider Locations"
            value={data.summary.unique_providers.toLocaleString()}
            subtitle={`${data.summary.provider_cities} cities`}
            icon={<Building2 className="h-5 w-5" />}
            color="text-indigo-600 bg-indigo-50"
          />
          <KpiCard
            title="Customer Addresses"
            value={data.summary.unique_customers.toLocaleString()}
            subtitle={`${data.summary.customer_cities} cities`}
            icon={<Users className="h-5 w-5" />}
            color="text-emerald-600 bg-emerald-50"
          />
          <KpiCard
            title="Registered Devices"
            value={data.summary.total_devices.toLocaleString()}
            subtitle={`${data.summary.active_devices_30d} active (30d)`}
            icon={<Smartphone className="h-5 w-5" />}
            color="text-blue-600 bg-blue-50"
          />
          <KpiCard
            title="Avg Booking Value"
            value={fmtMoney(data.booking_value.avg_booking_value)}
            subtitle={`${fmtMoney(data.booking_value.total)} total`}
            icon={<TrendingUp className="h-5 w-5" />}
            color="text-pink-600 bg-pink-50"
          />
        </div>

        <Tabs value={geoTab} onValueChange={setGeoTab} className="space-y-6">
          <TabsList className="grid h-auto min-h-10 w-full grid-cols-3 gap-1 p-1">
            <TabsTrigger value="geography" className="text-xs sm:text-sm">
              <MapPin className="h-4 w-4 mr-1 sm:mr-2 shrink-0" /> Geography
            </TabsTrigger>
            <TabsTrigger value="devices" className="text-xs sm:text-sm">
              <Smartphone className="h-4 w-4 mr-1 sm:mr-2 shrink-0" /> Devices
            </TabsTrigger>
            <TabsTrigger value="booking-value" className="text-xs sm:text-sm">
              <TrendingUp className="h-4 w-4 mr-1 sm:mr-2 shrink-0" /> Booking Value
            </TabsTrigger>
          </TabsList>

          {/* Geography Tab */}
          <TabsContent value="geography" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Provider Distribution Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-indigo-600" />
                    Providers by City (Top 10)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {topProviderCities.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={topProviderCities}
                        layout="vertical"
                        margin={{ left: 80 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f0f0f0"
                        />
                        <XAxis type="number" />
                        <YAxis
                          type="category"
                          dataKey="city"
                          tick={{ fontSize: 12 }}
                          width={75}
                        />
                        <Tooltip />
                        <Bar
                          dataKey="count"
                          fill="#6366f1"
                          name="Locations"
                          radius={[0, 4, 4, 0]}
                        />
                        <Bar
                          dataKey="active"
                          fill="#10b981"
                          name="Active"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-8">
                      No provider location data
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Customer Distribution Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4 text-emerald-600" />
                    Customers by City (Top 10)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {topCustomerCities.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={topCustomerCities}
                        layout="vertical"
                        margin={{ left: 80 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f0f0f0"
                        />
                        <XAxis type="number" />
                        <YAxis
                          type="category"
                          dataKey="city"
                          tick={{ fontSize: 12 }}
                          width={75}
                        />
                        <Tooltip />
                        <Bar
                          dataKey="count"
                          fill="#10b981"
                          name="Customers"
                          radius={[0, 4, 4, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-8">
                      No customer address data
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Detailed City Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Provider City Table */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      All Provider Locations by City
                    </CardTitle>
                    <Badge variant="secondary">
                      {filteredProviderCities.length} cities
                    </Badge>
                  </div>
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search city..."
                      value={providerSearch}
                      onChange={(e) => setProviderSearch(e.target.value)}
                      className="pl-9 h-8 text-sm"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white border-b">
                        <tr>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">
                            City
                          </th>
                          <th className="text-right py-2 px-2 font-medium text-gray-500">
                            Locations
                          </th>
                          <th className="text-right py-2 px-2 font-medium text-gray-500">
                            Active
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProviderCities.map((c) => (
                          <tr
                            key={c.city}
                            className="border-b last:border-0 hover:bg-gray-50"
                          >
                            <td className="py-2 px-2 font-medium">
                              {c.city}
                            </td>
                            <td className="py-2 px-2 text-right">
                              {c.count}
                            </td>
                            <td className="py-2 px-2 text-right text-green-600">
                              {c.active}
                            </td>
                          </tr>
                        ))}
                        {filteredProviderCities.length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              className="py-6 text-center text-gray-400"
                            >
                              No results
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Customer City Table */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      All Customers by City
                    </CardTitle>
                    <Badge variant="secondary">
                      {filteredCustomerCities.length} cities
                    </Badge>
                  </div>
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search city..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="pl-9 h-8 text-sm"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white border-b">
                        <tr>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">
                            City
                          </th>
                          <th className="text-right py-2 px-2 font-medium text-gray-500">
                            Customers
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCustomerCities.map((c) => (
                          <tr
                            key={c.city}
                            className="border-b last:border-0 hover:bg-gray-50"
                          >
                            <td className="py-2 px-2 font-medium">
                              {c.city}
                            </td>
                            <td className="py-2 px-2 text-right">
                              {c.count}
                            </td>
                          </tr>
                        ))}
                        {filteredCustomerCities.length === 0 && (
                          <tr>
                            <td
                              colSpan={2}
                              className="py-6 text-center text-gray-400"
                            >
                              No results
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Postal Code Drilldown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Provider Density by Postal Code (Top 50)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[300px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white border-b">
                        <tr>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">
                            Postal Code
                          </th>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">
                            City
                          </th>
                          <th className="text-right py-2 px-2 font-medium text-gray-500">
                            Providers
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.providers_by_postal.map((p) => (
                          <tr
                            key={p.postal_code}
                            className="border-b last:border-0 hover:bg-gray-50"
                          >
                            <td className="py-1.5 px-2 font-mono text-xs">
                              {p.postal_code}
                            </td>
                            <td className="py-1.5 px-2">{p.city}</td>
                            <td className="py-1.5 px-2 text-right font-medium">
                              {p.count}
                            </td>
                          </tr>
                        ))}
                        {data.providers_by_postal.length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              className="py-6 text-center text-gray-400"
                            >
                              No postal code data
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Customer Density by Postal Code (Top 50)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[300px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white border-b">
                        <tr>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">
                            Postal Code
                          </th>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">
                            City
                          </th>
                          <th className="text-right py-2 px-2 font-medium text-gray-500">
                            Customers
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.customers_by_postal.map((p) => (
                          <tr
                            key={p.postal_code}
                            className="border-b last:border-0 hover:bg-gray-50"
                          >
                            <td className="py-1.5 px-2 font-mono text-xs">
                              {p.postal_code}
                            </td>
                            <td className="py-1.5 px-2">{p.city}</td>
                            <td className="py-1.5 px-2 text-right font-medium">
                              {p.count}
                            </td>
                          </tr>
                        ))}
                        {data.customers_by_postal.length === 0 && (
                          <tr>
                            <td
                              colSpan={3}
                              className="py-6 text-center text-gray-400"
                            >
                              No postal code data
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Devices Tab */}
          <TabsContent value="devices" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Platform Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    Device Platform Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {totalDevices > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={data.device_platforms}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          innerRadius={50}
                          dataKey="total"
                          nameKey="platform"
                          label={({ platform, total }) =>
                            `${platform.toUpperCase()} (${total})`
                          }
                        >
                          {data.device_platforms.map((d) => (
                            <Cell
                              key={d.platform}
                              fill={PLATFORM_COLORS[d.platform] ?? "#94a3b8"}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-8">
                      No device data
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Customer vs Provider by Platform */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    Customer vs Provider App Downloads
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {totalDevices > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={data.device_platforms}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#f0f0f0"
                        />
                        <XAxis
                          dataKey="platform"
                          tickFormatter={(v: string) => v.toUpperCase()}
                        />
                        <YAxis />
                        <Tooltip
                          labelFormatter={(v: string) =>
                            v.toString().toUpperCase()
                          }
                        />
                        <Legend />
                        <Bar
                          dataKey="customer"
                          fill="#10b981"
                          name="Customer App"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="provider"
                          fill="#6366f1"
                          name="Provider App"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-8">
                      No device data
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Device Detail Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {data.device_platforms.map((d) => {
                const pct =
                  totalDevices > 0
                    ? ((d.total / totalDevices) * 100).toFixed(1)
                    : "0";
                const Icon =
                  d.platform === "web" ? Monitor : Smartphone;
                return (
                  <Card key={d.platform}>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="p-2 rounded-lg"
                          style={{
                            backgroundColor: `${PLATFORM_COLORS[d.platform] ?? "#94a3b8"}20`,
                          }}
                        >
                          <Icon
                            className="h-5 w-5"
                            style={{
                              color:
                                PLATFORM_COLORS[d.platform] ?? "#94a3b8",
                            }}
                          />
                        </div>
                        <div>
                          <p className="text-lg font-bold">
                            {d.platform.toUpperCase()}
                          </p>
                          <p className="text-xs text-gray-500">
                            {pct}% of all devices
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Total</span>
                          <span className="font-semibold">
                            {d.total.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">
                            Customer App
                          </span>
                          <span className="font-medium text-emerald-600">
                            {d.customer.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">
                            Provider App
                          </span>
                          <span className="font-medium text-indigo-600">
                            {d.provider.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="bg-amber-50/50 border-amber-200">
              <CardContent className="pt-6">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> Device data is based on push
                  notification registrations (OneSignal). Platform tracks iOS,
                  Android, and Web. Huawei devices register as Android.
                  Unregistered users (no push) are not counted.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Booking Value Tab */}
          <TabsContent value="booking-value" className="space-y-6">
            {data.booking_window_note && (
              <p className="text-xs text-gray-500">{data.booking_window_note}</p>
            )}
            {/* At Home vs At Salon */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Home className="h-4 w-4 text-purple-600" />
                    <p className="text-sm text-gray-500">At-Home Bookings</p>
                  </div>
                  <p className="text-2xl font-bold">
                    {data.booking_value.at_home.count.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Value: {fmtMoney(data.booking_value.at_home.value)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Store className="h-4 w-4 text-blue-600" />
                    <p className="text-sm text-gray-500">At-Salon Bookings</p>
                  </div>
                  <p className="text-2xl font-bold">
                    {data.booking_value.at_salon.count.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Value: {fmtMoney(data.booking_value.at_salon.value)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-pink-600" />
                    <p className="text-sm text-gray-500">
                      Average Booking Value
                    </p>
                  </div>
                  <p className="text-2xl font-bold">
                    {fmtMoney(data.booking_value.avg_booking_value)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Total GMV: {fmtMoney(data.booking_value.total)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Booking Value by City */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Booking Value by City (Top 10)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topBookingCities.length > 0 ? (
                  <div className="min-h-[360px] w-full" aria-label="Booking value by city chart">
                    <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={topBookingCities}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f0f0f0"
                      />
                      <XAxis
                        dataKey="city"
                        tick={{ fontSize: 11 }}
                        angle={-30}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis yAxisId="value" orientation="left" />
                      <YAxis
                        yAxisId="count"
                        orientation="right"
                        stroke="#94a3b8"
                      />
                      <Tooltip
                        formatter={(value: number, name: string) =>
                          name === "Booking Value"
                            ? fmtMoney(value)
                            : value
                        }
                      />
                      <Legend />
                      <Bar
                        yAxisId="value"
                        dataKey="value"
                        fill="#FF0077"
                        name="Booking Value"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        yAxisId="count"
                        dataKey="count"
                        fill="#6366f1"
                        name="Booking Count"
                        radius={[4, 4, 0, 0]}
                        opacity={0.5}
                      />
                    </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">
                    No booking geo data
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Booking detail table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  All Bookings by City
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white border-b">
                      <tr>
                        <th className="text-left py-2 px-2 font-medium text-gray-500">
                          City
                        </th>
                        <th className="text-right py-2 px-2 font-medium text-gray-500">
                          Bookings
                        </th>
                        <th className="text-right py-2 px-2 font-medium text-gray-500">
                          Value
                        </th>
                        <th className="text-right py-2 px-2 font-medium text-gray-500">
                          At Home
                        </th>
                        <th className="text-right py-2 px-2 font-medium text-gray-500">
                          At Salon
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bookings_by_city.map((b) => (
                        <tr
                          key={b.city}
                          className="border-b last:border-0 hover:bg-gray-50"
                        >
                          <td className="py-2 px-2 font-medium">{b.city}</td>
                          <td className="py-2 px-2 text-right">{b.count}</td>
                          <td className="py-2 px-2 text-right font-medium">
                            {fmtMoney(b.value)}
                          </td>
                          <td className="py-2 px-2 text-right text-purple-600">
                            {b.at_home}
                          </td>
                          <td className="py-2 px-2 text-right text-blue-600">
                            {b.at_salon}
                          </td>
                        </tr>
                      ))}
                      {data.bookings_by_city.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="py-6 text-center text-gray-400"
                          >
                            No data
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${color}`}>{icon}</div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-gray-500">{title}</p>
            <p className="text-[10px] text-gray-400">{subtitle}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
