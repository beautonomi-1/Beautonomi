import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

interface PackageReport {
  id: string;
  name: string;
  total_sold: number;
  total_revenue: number;
  active_count: number;
  usage_rate: number;
  avg_completion_days: number | null;
  services_included: number;
}

interface PackageStats {
  total_packages: number;
  total_sold: number;
  total_revenue: number;
  active_subscriptions: number;
  avg_usage_rate: number;
}

const PERIOD_FILTERS = [
  { label: "All Time", value: "all" },
  { label: "This Month", value: "month" },
  { label: "This Quarter", value: "quarter" },
  { label: "This Year", value: "year" },
];

export default function PackageReportScreen() {
  const { selectedLocationId } = useProvider();
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState("month");

  const packagesUrl = `/api/provider/reports/packages?period=${period}${selectedLocationId ? `&location_id=${encodeURIComponent(selectedLocationId)}` : ""}`;
  const { data: reportData, loading, error: dataError, refresh } = useApi<{
    stats: PackageStats;
    packages: PackageReport[];
  }>(packagesUrl);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const stats = reportData?.stats;
  const packages = reportData?.packages ?? [];

  async function handleExport() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const rows = packages.map(
      (p) => `${p.name},${p.total_sold},${formatCurrency(p.total_revenue)},${p.active_count},${(p.usage_rate * 100).toFixed(0)}%`
    );
    const csv = `Package,Sold,Revenue,Active,Usage Rate\n${rows.join("\n")}`;
    try {
      await Share.share({ message: csv, title: "Package Report" });
    } catch {}
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Package Report"
        showBack
        subtitle="Sales & usage analytics"
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
            onPress={handleExport}
          >
            <Ionicons name="download-outline" size={18} color="#374151" />
          </TouchableOpacity>
        }
      />

      <View style={twStyle("mb-3 flex-row")}>
        <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
          <StatCard title="Total Sold" value={String(stats?.total_sold ?? 0)} icon="layers-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
        </View>
        <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
          <StatCard title="Revenue" value={formatCurrency(stats?.total_revenue ?? 0)} icon="cash-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
        </View>
        <View style={twStyle("flex-1")}>
          <StatCard title="Active" value={String(stats?.active_subscriptions ?? 0)} icon="radio-button-on" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
        </View>
      </View>

      <View style={twStyle("mb-3")}>
        <FilterChipGroup options={PERIOD_FILTERS} selected={period} onSelect={setPeriod} />
      </View>

      {loading && !reportData ? (
        <SkeletonList rows={5} />
      ) : !loading && dataError && !reportData ? (
        <ErrorState message={dataError} onRetry={refresh} />
      ) : packages.length === 0 ? (
        <EmptyState icon="layers-outline" title="No package data" description="Package sales will appear here" />
      ) : (
        <FlatList
          data={packages}
          keyExtractor={(p: PackageReport) => p.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: pkg }: { item: PackageReport }) => (
            <View style={twStyle("rounded-xl border border-gray-100 bg-white p-4")}>
              <View style={twStyle("flex-row items-start justify-between")}>
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>{pkg.name}</Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    {pkg.services_included} services included
                  </Text>
                  <View style={twStyle("mt-2 flex-row items-center")}>
                    <View style={[twStyle("flex-row items-center"), { marginRight: 12 }]}>
                      <Ionicons name="cart-outline" size={12} color="#6b7280" style={{ marginRight: 4 }} />
                      <Text style={twStyle("text-xs text-gray-500")}>{pkg.total_sold} sold</Text>
                    </View>
                    <View style={twStyle("flex-row items-center")}>
                      <Ionicons name="people-outline" size={12} color="#6b7280" style={{ marginRight: 4 }} />
                      <Text style={twStyle("text-xs text-gray-500")}>{pkg.active_count} active</Text>
                    </View>
                  </View>
                </View>
                <View style={twStyle("items-end")}>
                  <Text style={twStyle("text-base font-bold text-gray-900")}>
                    {formatCurrency(pkg.total_revenue)}
                  </Text>
                  <View style={twStyle("mt-1 flex-row items-center")}>
                    <Text style={[twStyle("text-xs text-gray-500"), { marginRight: 4 }]}>Usage:</Text>
                    <Text style={twStyle(`text-xs font-semibold ${
                      pkg.usage_rate >= 0.7 ? "text-green-600" : pkg.usage_rate >= 0.4 ? "text-amber-600" : "text-red-600"
                    }`)}>
                      {(pkg.usage_rate * 100).toFixed(0)}%
                    </Text>
                  </View>
                  {/* Usage bar */}
                  <View style={twStyle("mt-1 h-1.5 w-16 rounded-full bg-gray-100 overflow-hidden")}>
                    <View
                      style={[twStyle(`h-full rounded-full ${
                        pkg.usage_rate >= 0.7 ? "bg-green-500" : pkg.usage_rate >= 0.4 ? "bg-amber-500" : "bg-red-500"
                      }`), { width: `${Math.min(pkg.usage_rate * 100, 100)}%` }]}
                    />
                  </View>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </ScreenContainer>
  );
}
