import { useState } from "react";
import {
  Alert,
  View,
  Text,
  TouchableOpacity,
  Share,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { appendReportLocation } from "@/lib/reportLocationQuery";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { ReportResponsiveStatRow } from "@/components/reports/ReportResponsiveStatRow";

interface BusinessReport {
  revenue: {
    total: number;
    previous_period: number;
    growth_percentage: number;
    by_service: { name: string; amount: number }[];
    by_staff: { name: string; amount: number }[];
  };
  bookings: {
    total: number;
    completed: number;
    cancelled: number;
    no_show: number;
    completion_rate: number;
    avg_per_day: number;
  };
  clients: {
    total: number;
    new_this_period: number;
    returning: number;
    retention_rate: number;
    avg_booking_value: number;
  };
  staff: {
    total: number;
    avg_bookings_per_staff: number;
    top_performer: string | null;
    total_hours: number;
  };
  products: {
    total_sold: number;
    product_revenue: number;
    top_product: string | null;
  };
}

const PERIOD_FILTERS = [
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "This Quarter", value: "quarter" },
  { label: "This Year", value: "year" },
];

/** Overview API response shape (business/overview) */
type OverviewResponse = {
  period?: string;
  totalRevenue?: number;
  cancellationFees?: number;
  netRevenue?: number;
  totalBookings?: number;
  completedBookings?: number;
  cancelledBookings?: number;
  noShows?: number;
  uniqueClients?: number;
  totalStaff?: number;
  totalPayments?: number;
  successfulPayments?: number;
  totalRefunded?: number;
  averageBookingValue?: number;
  completionRate?: number;
  cancellationRate?: number;
  noShowRate?: number;
  revenueGrowth?: number;
};

function mapOverviewToBusinessReport(overview: OverviewResponse | null): BusinessReport | null {
  if (!overview) return null;
  const days = overview.period === "year" ? 365 : overview.period === "quarter" ? 92 : overview.period === "week" ? 7 : 30;
  return {
    revenue: {
      total: overview.totalRevenue ?? 0,
      previous_period: 0,
      growth_percentage: overview.revenueGrowth ?? 0,
      by_service: [],
      by_staff: [],
    },
    bookings: {
      total: overview.totalBookings ?? 0,
      completed: overview.completedBookings ?? 0,
      cancelled: overview.cancelledBookings ?? 0,
      no_show: overview.noShows ?? 0,
      completion_rate: overview.completionRate ?? 0,
      avg_per_day: (overview.totalBookings ?? 0) / Math.max(days, 1),
    },
    clients: {
      total: overview.uniqueClients ?? 0,
      new_this_period: 0,
      returning: overview.uniqueClients ?? 0,
      retention_rate: 0,
      avg_booking_value: overview.averageBookingValue ?? 0,
    },
    staff: {
      total: overview.totalStaff ?? 0,
      avg_bookings_per_staff: (overview.totalStaff ?? 0) > 0 ? (overview.totalBookings ?? 0) / (overview.totalStaff ?? 0) : 0,
      top_performer: null,
      total_hours: 0,
    },
    products: {
      total_sold: 0,
      product_revenue: 0,
      top_product: null,
    },
  };
}

export default function BusinessReportScreen() {
  const router = useRouter();
  const { selectedLocationId } = useProvider();
  const [period, setPeriod] = useState("month");

  const businessUrl = appendReportLocation(`/api/provider/reports/business/overview?period=${period}`, selectedLocationId);
  const { data: overview, loading, error: dataError, timedOut, refresh } = useApi<OverviewResponse>(
    businessUrl,
    { timeoutMs: 15000 }
  );
  const report = mapOverviewToBusinessReport(overview);

  async function handleExport() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!report) return;
    const lines = [
      `Business Report — ${period}`,
      "",
      `Revenue: ${formatCurrency(report.revenue.total)}`,
      `Growth: ${report.revenue.growth_percentage >= 0 ? "+" : ""}${report.revenue.growth_percentage.toFixed(1)}%`,
      `Bookings: ${report.bookings.total} (${report.bookings.completion_rate.toFixed(0)}% completion)`,
      `Unique Clients: ${report.clients.total}`,
      `Avg Booking Value: ${formatCurrency(report.clients.avg_booking_value)}`,
    ];
    try {
      await Share.share({ message: lines.join("\n"), title: "Business Report" });
    } catch (err) {
      console.error("Failed to share business report:", err);
      Alert.alert("Export Failed", "Could not share the report. Please try again.");
    }
  }

  if (timedOut && !report) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Business Overview" showBack />
        <ErrorState
          message="Request is taking longer than usual. Check your connection and try again."
          onRetry={refresh}
          retryLabel="Retry"
        />
      </ScreenContainer>
    );
  }

  if (dataError && !report) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Business Overview" showBack />
        <ErrorState message={dataError} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  if (loading && !report) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Business Overview" showBack />
        <LoadingState />
      </ScreenContainer>
    );
  }

  const r = report;

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Business Overview"
        showBack
        subtitle="Performance dashboard"
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
            onPress={handleExport}
          >
            <Ionicons name="download-outline" size={18} color="#374151" />
          </TouchableOpacity>
        }
      />

      <View style={twStyle("mb-4")}>
        <FilterChipGroup options={PERIOD_FILTERS} selected={period} onSelect={setPeriod} />
      </View>

      {/* Revenue */}
      <SectionHeader title="Revenue" />
      <View style={twStyle("mb-4")}>
        <ReportResponsiveStatRow>
          <StatCard
            title="Total Revenue"
            value={formatCurrency(r?.revenue.total ?? 0)}
            icon="cash-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            compact
          />
          <StatCard
            title="Growth"
            value={`${(r?.revenue.growth_percentage ?? 0) >= 0 ? "+" : ""}${(r?.revenue.growth_percentage ?? 0).toFixed(1)}%`}
            icon="trending-up-outline"
            iconColor={(r?.revenue.growth_percentage ?? 0) >= 0 ? "#22c55e" : "#ef4444"}
            iconBg={(r?.revenue.growth_percentage ?? 0) >= 0 ? "bg-green-50" : "bg-red-50"}
            compact
          />
        </ReportResponsiveStatRow>
      </View>

      {((overview?.cancellationFees ?? 0) > 0 || (overview?.totalRefunded ?? 0) > 0 || (overview?.netRevenue ?? 0) !== (overview?.totalRevenue ?? 0)) && (
        <View style={twStyle("mb-4 rounded-xl border border-gray-100 bg-white p-4")}>
          {(overview?.cancellationFees ?? 0) > 0 && (
            <View style={twStyle("flex-row justify-between mb-2")}>
              <Text style={twStyle("text-sm text-gray-500")}>Cancellation Fees</Text>
              <Text style={twStyle("text-sm font-medium text-amber-600")}>{formatCurrency(overview!.cancellationFees!)}</Text>
            </View>
          )}
          {(overview?.totalRefunded ?? 0) > 0 && (
            <View style={twStyle("flex-row justify-between mb-2")}>
              <Text style={twStyle("text-sm text-gray-500")}>Refunds</Text>
              <Text style={twStyle("text-sm font-medium text-red-600")}>−{formatCurrency(overview!.totalRefunded!)}</Text>
            </View>
          )}
          <View style={twStyle("flex-row justify-between pt-2 border-t border-gray-50")}>
            <Text style={twStyle("text-sm font-semibold text-gray-700")}>Net Revenue</Text>
            <Text style={twStyle("text-sm font-bold text-indigo-600")}>{formatCurrency(overview?.netRevenue ?? r?.revenue.total ?? 0)}</Text>
          </View>
        </View>
      )}

      {r?.revenue.by_service && r.revenue.by_service.length > 0 && (
        <View style={twStyle("mb-4 rounded-xl border border-gray-100 bg-white p-4")}>
          <Text style={twStyle("mb-2 text-xs font-semibold uppercase text-gray-400")}>Top Services</Text>
          {r.revenue.by_service.slice(0, 5).map((s, i) => {
            const maxAmount = r.revenue.by_service[0]?.amount ?? 1;
            return (
              <View key={i} style={twStyle("mb-2")}>
                <View style={twStyle("flex-row items-center justify-between mb-1")}>
                  <Text style={twStyle("text-sm text-gray-700")} numberOfLines={1}>{s.name}</Text>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>{formatCurrency(s.amount)}</Text>
                </View>
                <View style={twStyle("h-1.5 rounded-full bg-gray-100 overflow-hidden")}>
                  <View
                    style={[twStyle("h-full rounded-full bg-indigo-500"), { width: `${(s.amount / maxAmount) * 100}%` }]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {r?.revenue.by_staff && r.revenue.by_staff.length > 0 && (
        <View style={twStyle("mb-4 rounded-xl border border-gray-100 bg-white p-4")}>
          <Text style={twStyle("mb-2 text-xs font-semibold uppercase text-gray-400")}>Revenue by Staff</Text>
          {r.revenue.by_staff.slice(0, 5).map((s, i) => {
            const maxAmount = r.revenue.by_staff[0]?.amount ?? 1;
            return (
              <View key={i} style={twStyle("mb-2")}>
                <View style={twStyle("flex-row items-center justify-between mb-1")}>
                  <Text style={twStyle("text-sm text-gray-700")}>{s.name}</Text>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>{formatCurrency(s.amount)}</Text>
                </View>
                <View style={twStyle("h-1.5 rounded-full bg-gray-100 overflow-hidden")}>
                  <View
                    style={[twStyle("h-full rounded-full bg-emerald-500"), { width: `${(s.amount / maxAmount) * 100}%` }]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Bookings */}
      <SectionHeader title="Bookings" />
      <View style={twStyle("mb-4")}>
        <ReportResponsiveStatRow>
          <StatCard title="Total" value={String(r?.bookings.total ?? 0)} icon="calendar-outline" iconColor="#3b82f6" iconBg="bg-blue-50" compact />
          <StatCard title="Completed" value={String(r?.bookings.completed ?? 0)} icon="checkmark-circle-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
          <StatCard title="Rate" value={`${(r?.bookings.completion_rate ?? 0).toFixed(0)}%`} icon="analytics-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
        </ReportResponsiveStatRow>
      </View>

      <View style={twStyle("mb-4 rounded-xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("flex-row justify-between mb-2")}>
          <Text style={twStyle("text-sm text-gray-500")}>Cancelled</Text>
          <Text style={twStyle("text-sm font-medium text-red-600")}>{r?.bookings.cancelled ?? 0}</Text>
        </View>
        <View style={twStyle("flex-row justify-between mb-2")}>
          <Text style={twStyle("text-sm text-gray-500")}>No-Shows</Text>
          <Text style={twStyle("text-sm font-medium text-amber-600")}>{r?.bookings.no_show ?? 0}</Text>
        </View>
        <View style={twStyle("flex-row justify-between")}>
          <Text style={twStyle("text-sm text-gray-500")}>Avg Per Day</Text>
          <Text style={twStyle("text-sm font-medium text-gray-700")}>{(r?.bookings.avg_per_day ?? 0).toFixed(1)}</Text>
        </View>
      </View>

      {/*
        §Provider-audit 2026-04 (round 8): Clients / Staff / Products
        sections previously rendered hard-coded zeros because the
        /business/overview endpoint does not return new-vs-returning,
        retention, hours-worked, or product-sold breakdowns — those live
        on the dedicated per-report endpoints. Rendering a "New: 0" /
        "Retention: 0%" / "Staff Hours: 0h" card that never updates is
        actively misleading, so we only show the stat that IS computed
        (total unique clients, avg booking value) and redirect deeper
        questions to the specialised report screens.
      */}
      <SectionHeader title="Clients" />
      <View style={twStyle("mb-4")}>
        <ReportResponsiveStatRow>
          <StatCard title="Unique Clients" value={String(r?.clients.total ?? 0)} icon="people-outline" iconColor="#ec4899" iconBg="bg-pink-50" compact />
          <StatCard title="Avg Booking" value={formatCurrency(r?.clients.avg_booking_value ?? 0)} icon="cash-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
        </ReportResponsiveStatRow>
      </View>

      <View style={twStyle("mb-4 flex-row")}>
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/reports/clients")}
          style={twStyle("flex-1 mr-2 rounded-xl border border-gray-200 bg-white px-4 py-3 flex-row items-center justify-between")}
        >
          <Text style={twStyle("text-sm font-medium text-gray-700")}>Client retention</Text>
          <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/reports/staff")}
          style={twStyle("flex-1 ml-2 rounded-xl border border-gray-200 bg-white px-4 py-3 flex-row items-center justify-between")}
        >
          <Text style={twStyle("text-sm font-medium text-gray-700")}>Staff & hours</Text>
          <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      <View style={twStyle("mb-4 flex-row")}>
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/reports/products")}
          style={twStyle("flex-1 mr-2 rounded-xl border border-gray-200 bg-white px-4 py-3 flex-row items-center justify-between")}
        >
          <Text style={twStyle("text-sm font-medium text-gray-700")}>Products & inventory</Text>
          <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/reports/services")}
          style={twStyle("flex-1 ml-2 rounded-xl border border-gray-200 bg-white px-4 py-3 flex-row items-center justify-between")}
        >
          <Text style={twStyle("text-sm font-medium text-gray-700")}>Services breakdown</Text>
          <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
