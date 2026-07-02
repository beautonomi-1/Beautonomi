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
import { ActiveLocationChip } from "@/components/reports/ActiveLocationChip";

interface BusinessReport {
  revenue: {
    total: number;
    previous_period: number;
    growth_percentage: number;
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
  timezone?: string;
  fromYmd?: string;
  toYmd?: string;
  period?: string;
  reportBasis?: string;
  basis?: Record<string, string>;
  totalRevenue?: number;
  serviceEarnings?: number;
  ledgerEarningsFromBookings?: number;
  ledgerEarningsFromProductOrders?: number;
  cancellationFees?: number;
  tipsTotal?: number;
  travelFeesTotal?: number;
  walkInAdditionalChargesTotal?: number;
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
  periodStart?: string;
  periodEnd?: string;
  new_this_period?: number;
  returning?: number;
  retention_rate?: number;
  product_revenue?: number;
  product_orders_with_earnings?: number;
};

function daysInOverviewPeriod(o: OverviewResponse): number {
  if (!o.periodStart || !o.periodEnd) return 1;
  const ms = new Date(o.periodEnd).getTime() - new Date(o.periodStart).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

function mapOverviewToBusinessReport(overview: OverviewResponse | null): BusinessReport | null {
  if (!overview) return null;
  const days = daysInOverviewPeriod(overview);
  return {
    revenue: {
      total: overview.totalRevenue ?? 0,
      previous_period: 0,
      growth_percentage: overview.revenueGrowth ?? 0,
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
      new_this_period: overview.new_this_period ?? 0,
      returning: overview.returning ?? 0,
      retention_rate: overview.retention_rate ?? 0,
      avg_booking_value: overview.averageBookingValue ?? 0,
    },
    staff: {
      total: overview.totalStaff ?? 0,
      avg_bookings_per_staff: (overview.totalStaff ?? 0) > 0 ? (overview.totalBookings ?? 0) / (overview.totalStaff ?? 0) : 0,
      top_performer: null,
      total_hours: 0,
    },
    products: {
      total_sold: overview.product_orders_with_earnings ?? 0,
      product_revenue: overview.product_revenue ?? overview.ledgerEarningsFromProductOrders ?? 0,
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
      `Business overview — ${period}`,
      overview?.fromYmd && overview?.toYmd ? `Window: ${overview.fromYmd} → ${overview.toYmd}` : "",
      overview?.timezone ? `Timezone: ${overview.timezone}` : "",
      "",
      `Recognized revenue (earnings + tips + travel + cancellation + walk-in): ${formatCurrency(report.revenue.total)}`,
      `Service earnings (provider_earnings): ${formatCurrency(overview?.serviceEarnings ?? 0)}`,
      overview?.netRevenue != null ? `Net after refunds: ${formatCurrency(overview.netRevenue)}` : "",
      `Growth vs prior window: ${report.revenue.growth_percentage >= 0 ? "+" : ""}${report.revenue.growth_percentage.toFixed(1)}%`,
      `Scheduled bookings: ${report.bookings.total} (${report.bookings.completion_rate.toFixed(0)}% completion)`,
      `Distinct clients: ${report.clients.total}`,
      `Avg ledger per booking (with earnings): ${formatCurrency(report.clients.avg_booking_value)}`,
    ].filter(Boolean);
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
        subtitle="Ledger + scheduled bookings · period to date"
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
            onPress={handleExport}
          >
            <Ionicons name="download-outline" size={18} color="#374151" />
          </TouchableOpacity>
        }
      />

      <ActiveLocationChip />

      <View style={twStyle("mb-4")}>
        <FilterChipGroup options={PERIOD_FILTERS} selected={period} onSelect={setPeriod} />
      </View>

      {overview?.reportBasis ? (
        <View style={twStyle("mb-4 rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-sky-900")}>What this counts</Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-sky-950")}>{overview.reportBasis}</Text>
          {overview.fromYmd && overview.toYmd ? (
            <Text style={twStyle("mt-2 text-xs text-sky-900/85")}>
              {overview.fromYmd} → {overview.toYmd}
              {overview.timezone ? ` · ${overview.timezone}` : ""}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Revenue */}
      <SectionHeader title="Revenue" />
      <View style={twStyle("mb-4")}>
        <ReportResponsiveStatRow>
          <StatCard
            title="Gross recognized"
            value={formatCurrency(r?.revenue.total ?? 0)}
            subtitle="Before refund clawbacks"
            icon="cash-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            compact
          />
          {overview?.netRevenue != null ? (
            <StatCard
              title="Net of refunds"
              value={formatCurrency(overview.netRevenue)}
              subtitle="After refund clawbacks"
              icon="shield-checkmark-outline"
              iconColor="#0d9488"
              iconBg="bg-teal-50"
              compact
            />
          ) : null}
          <StatCard
            title="Vs prior window"
            value={`${(r?.revenue.growth_percentage ?? 0) >= 0 ? "+" : ""}${(r?.revenue.growth_percentage ?? 0).toFixed(1)}%`}
            icon="trending-up-outline"
            iconColor={(r?.revenue.growth_percentage ?? 0) >= 0 ? "#22c55e" : "#ef4444"}
            iconBg={(r?.revenue.growth_percentage ?? 0) >= 0 ? "bg-green-50" : "bg-red-50"}
            compact
          />
        </ReportResponsiveStatRow>
      </View>

      {(overview?.totalRevenue ?? 0) > 0 && (
        <View style={twStyle("mb-4 rounded-xl border border-gray-100 bg-white p-4")}>
          <Text style={twStyle("mb-2 text-xs font-semibold uppercase text-gray-400")}>What makes up recognized revenue</Text>
          {(overview?.serviceEarnings ?? 0) !== 0 && (
            <View style={twStyle("flex-row justify-between mb-2")}>
              <Text style={twStyle("text-sm text-gray-500")}>Service earnings</Text>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{formatCurrency(overview!.serviceEarnings!)}</Text>
            </View>
          )}
          {(overview?.tipsTotal ?? 0) > 0 && (
            <View style={twStyle("flex-row justify-between mb-2")}>
              <Text style={twStyle("text-sm text-gray-500")}>Tips</Text>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{formatCurrency(overview!.tipsTotal!)}</Text>
            </View>
          )}
          {(overview?.travelFeesTotal ?? 0) > 0 && (
            <View style={twStyle("flex-row justify-between mb-2")}>
              <Text style={twStyle("text-sm text-gray-500")}>Travel fees</Text>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{formatCurrency(overview!.travelFeesTotal!)}</Text>
            </View>
          )}
          {(overview?.cancellationFees ?? 0) > 0 && (
            <View style={twStyle("flex-row justify-between mb-2")}>
              <Text style={twStyle("text-sm text-gray-500")}>Cancellation fees</Text>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{formatCurrency(overview!.cancellationFees!)}</Text>
            </View>
          )}
          {(overview?.walkInAdditionalChargesTotal ?? 0) > 0 && (
            <View style={twStyle("flex-row justify-between mb-2")}>
              <Text style={twStyle("text-sm text-gray-500")}>Walk-in add-ons</Text>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>{formatCurrency(overview!.walkInAdditionalChargesTotal!)}</Text>
            </View>
          )}
          {(overview?.totalRefunded ?? 0) > 0 && (
            <View style={twStyle("flex-row justify-between mb-2")}>
              <Text style={twStyle("text-sm text-gray-500")}>Refunds</Text>
              <Text style={twStyle("text-sm font-medium text-red-600")}>−{formatCurrency(overview!.totalRefunded!)}</Text>
            </View>
          )}
          <View style={twStyle("flex-row justify-between pt-2 border-t border-gray-50")}>
            <Text style={twStyle("text-sm font-semibold text-gray-700")}>Net after refunds</Text>
            <Text style={twStyle("text-sm font-bold text-indigo-600")}>{formatCurrency(overview?.netRevenue ?? r?.revenue.total ?? 0)}</Text>
          </View>
        </View>
      )}

      {/* Top services / revenue-by-staff intentionally live on the dedicated
          Services and Staff report screens (linked below); the overview API
          does not return those breakdowns. */}

      {/* Bookings */}
      <SectionHeader title="Scheduled bookings" />
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
          <Text style={twStyle("text-sm text-gray-500")}>Avg per calendar day</Text>
          <Text style={twStyle("text-sm font-medium text-gray-700")}>{(r?.bookings.avg_per_day ?? 0).toFixed(1)}</Text>
        </View>
      </View>

      {/*
        §Financial-reporting-audit 2026-06: the /business/overview endpoint now
        returns new-vs-returning client counts, retention rate and product
        revenue (recognised ledger earnings from product orders) for the
        selected period, so these cards bind to real API values instead of the
        previous hard-coded zeros. Staff hours / per-product breakdowns still
        live on the dedicated report screens linked below.
      */}
      <SectionHeader title="Clients" />
      <View style={twStyle("mb-4")}>
        <ReportResponsiveStatRow>
          <StatCard title="Unique Clients" value={String(r?.clients.total ?? 0)} icon="people-outline" iconColor="#ec4899" iconBg="bg-pink-50" compact />
          <StatCard
            title="New this period"
            value={String(r?.clients.new_this_period ?? 0)}
            icon="person-add-outline"
            iconColor="#10b981"
            iconBg="bg-emerald-50"
            compact
          />
        </ReportResponsiveStatRow>
        <ReportResponsiveStatRow>
          <StatCard
            title="Returning"
            value={String(r?.clients.returning ?? 0)}
            icon="repeat-outline"
            iconColor="#f59e0b"
            iconBg="bg-amber-50"
            compact
          />
          <StatCard
            title="Retention"
            value={`${(r?.clients.retention_rate ?? 0).toFixed(1)}%`}
            icon="trending-up-outline"
            iconColor="#8b5cf6"
            iconBg="bg-violet-50"
            compact
          />
        </ReportResponsiveStatRow>
        <ReportResponsiveStatRow>
          <StatCard
            title="Avg ledger / booking"
            value={formatCurrency(r?.clients.avg_booking_value ?? 0)}
            icon="cash-outline"
            iconColor="#6366f1"
            iconBg="bg-indigo-50"
            compact
          />
          <StatCard
            title="Product revenue"
            value={formatCurrency(r?.products.product_revenue ?? 0)}
            icon="bag-handle-outline"
            iconColor="#0ea5e9"
            iconBg="bg-sky-50"
            compact
          />
        </ReportResponsiveStatRow>
      </View>

      <View style={twStyle("mb-4 flex-row")}>
        <TouchableOpacity
          onPress={() => router.push("/(app)/(tabs)/more/reports/detail/client-summary" as never)}
          style={twStyle("flex-1 mr-2 rounded-xl border border-gray-200 bg-white px-4 py-3 flex-row items-center justify-between")}
        >
          <Text style={twStyle("text-sm font-medium text-gray-700")}>Clients</Text>
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
