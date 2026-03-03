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
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency } from "@/lib/format";

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
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState("month");

  const { data: reportData, loading, refresh } = useApi<{
    stats: PackageStats;
    packages: PackageReport[];
  }>(`/api/provider/reports/packages?period=${period}`);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
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
            className="h-10 w-10 items-center justify-center rounded-full bg-gray-100"
            onPress={handleExport}
          >
            <Ionicons name="download-outline" size={18} color="#374151" />
          </TouchableOpacity>
        }
      />

      <View className="mb-3 flex-row gap-2">
        <View className="flex-1">
          <StatCard title="Total Sold" value={String(stats?.total_sold ?? 0)} icon="layers-outline" iconColor="#6366f1" iconBg="bg-indigo-50" compact />
        </View>
        <View className="flex-1">
          <StatCard title="Revenue" value={formatCurrency(stats?.total_revenue ?? 0)} icon="cash-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
        </View>
        <View className="flex-1">
          <StatCard title="Active" value={String(stats?.active_subscriptions ?? 0)} icon="radio-button-on" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
        </View>
      </View>

      <View className="mb-3">
        <FilterChipGroup options={PERIOD_FILTERS} selected={period} onSelect={setPeriod} />
      </View>

      {loading && !reportData ? (
        <SkeletonList rows={5} />
      ) : packages.length === 0 ? (
        <EmptyState icon="layers-outline" title="No package data" description="Package sales will appear here" />
      ) : (
        <FlatList
          data={packages}
          keyExtractor={(p: PackageReport) => p.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120, gap: 8 }}
          renderItem={({ item: pkg }: { item: PackageReport }) => (
            <View className="rounded-xl border border-gray-100 bg-white p-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-gray-900">{pkg.name}</Text>
                  <Text className="mt-0.5 text-xs text-gray-500">
                    {pkg.services_included} services included
                  </Text>
                  <View className="mt-2 flex-row items-center gap-3">
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="cart-outline" size={12} color="#6b7280" />
                      <Text className="text-xs text-gray-500">{pkg.total_sold} sold</Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="people-outline" size={12} color="#6b7280" />
                      <Text className="text-xs text-gray-500">{pkg.active_count} active</Text>
                    </View>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-base font-bold text-gray-900">
                    {formatCurrency(pkg.total_revenue)}
                  </Text>
                  <View className="mt-1 flex-row items-center gap-1">
                    <Text className="text-xs text-gray-500">Usage:</Text>
                    <Text className={`text-xs font-semibold ${
                      pkg.usage_rate >= 0.7 ? "text-green-600" : pkg.usage_rate >= 0.4 ? "text-amber-600" : "text-red-600"
                    }`}>
                      {(pkg.usage_rate * 100).toFixed(0)}%
                    </Text>
                  </View>
                  {/* Usage bar */}
                  <View className="mt-1 h-1.5 w-16 rounded-full bg-gray-100 overflow-hidden">
                    <View
                      className={`h-full rounded-full ${
                        pkg.usage_rate >= 0.7 ? "bg-green-500" : pkg.usage_rate >= 0.4 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(pkg.usage_rate * 100, 100)}%` }}
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
