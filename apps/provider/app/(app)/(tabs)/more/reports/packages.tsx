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
import { appendReportLocation } from "@/lib/reportLocationQuery";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { ReportResponsiveStatRow } from "@/components/reports/ReportResponsiveStatRow";

interface PackageReport {
  id: string;
  name: string;
  total_sold: number;
  total_revenue: number;
  services_included: number;
}

interface PackageStats {
  total_packages: number;
  total_sold: number;
  total_revenue: number;
}

const PERIOD_FILTERS = [
  { label: "All Time", value: "all" },
  { label: "Last 30 days", value: "month" },
  { label: "Last 90 days", value: "quarter" },
  { label: "Last 365 days", value: "year" },
];

export default function PackageReportScreen() {
  const { selectedLocationId } = useProvider();
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState("month");

  const packagesUrl = appendReportLocation(`/api/provider/reports/packages?period=${period}`, selectedLocationId);
  const { data: reportData, loading, error: dataError, refresh } = useApi<{
    stats: PackageStats;
    packages: PackageReport[];
    reportBasis?: string;
    timezone?: string;
    fromYmd?: string;
    toYmd?: string;
    basis?: Record<string, string>;
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
  const basisText =
    typeof reportData?.reportBasis === "string" && reportData.reportBasis.trim()
      ? reportData.reportBasis
      : "";

  async function handleExport() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const tz = reportData?.timezone ?? "";
    const window =
      typeof reportData?.fromYmd === "string" && typeof reportData?.toYmd === "string"
        ? `${reportData.fromYmd}–${reportData.toYmd}`
        : "";
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const header = [
      `key,value`,
      `${esc("timezone")},${esc(tz)}`,
      `${esc("period")},${esc(period)}`,
      `${esc("calendar_window")},${esc(window)}`,
      "",
      "Package,Sold,Booked value,Services in catalog",
    ].join("\n");
    const rows = packages.map(
      (p) =>
        `${esc(p.name)},${p.total_sold},${p.total_revenue},${p.services_included}`,
    );
    const csv = `${header}\n${rows.join("\n")}`;
    try {
      await Share.share({ message: csv, title: "Packages overview" });
    } catch {}
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Packages overview"
        showBack
        subtitle="Active catalog · booked counts & value in period"
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
            onPress={handleExport}
          >
            <Ionicons name="download-outline" size={18} color="#374151" />
          </TouchableOpacity>
        }
      />

      {basisText ? (
        <View style={twStyle("mb-3 rounded-2xl border border-teal-100 bg-teal-50/90 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-teal-900")}>
            Basis
          </Text>
          <Text style={twStyle("mt-2 text-sm leading-5 text-teal-950")}>{basisText}</Text>
          {reportData?.timezone ? (
            <Text style={twStyle("mt-2 text-xs text-teal-900/85")}>Timezone · {reportData.timezone}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={twStyle("mb-3")}>
        <ReportResponsiveStatRow>
          <StatCard
            title="In catalog"
            value={String(stats?.total_packages ?? 0)}
            icon="layers-outline"
            iconColor="#6366f1"
            iconBg="bg-indigo-50"
            compact
          />
          <StatCard
            title="Bookings"
            value={String(stats?.total_sold ?? 0)}
            icon="calendar-outline"
            iconColor="#0f766e"
            iconBg="bg-teal-50"
            compact
          />
          <StatCard
            title="Booked value"
            value={formatCurrency(stats?.total_revenue ?? 0)}
            icon="cash-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            compact
          />
        </ReportResponsiveStatRow>
      </View>

      <View style={twStyle("mb-3")}>
        <FilterChipGroup options={PERIOD_FILTERS} selected={period} onSelect={setPeriod} />
      </View>

      {loading && !reportData ? (
        <SkeletonList rows={5} />
      ) : !loading && dataError && !reportData ? (
        <ErrorState message={dataError} onRetry={refresh} />
      ) : packages.length === 0 ? (
        <EmptyState icon="layers-outline" title="No packages" description="Create active service packages to see them here" />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={packages}
          keyExtractor={(p: PackageReport) => p.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: pkg }: { item: PackageReport }) => (
            <View style={twStyle("rounded-xl border border-gray-100 bg-white p-4")}>
              <View style={twStyle("flex-row items-start justify-between gap-3")}>
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>{pkg.name}</Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    {pkg.services_included} services in package
                  </Text>
                  <View style={twStyle("mt-2 flex-row flex-wrap gap-x-4 gap-y-1")}>
                    <View style={twStyle("flex-row items-center")}>
                      <Ionicons name="cart-outline" size={12} color="#6b7280" style={{ marginRight: 4 }} />
                      <Text style={twStyle("text-xs text-gray-600")}>{pkg.total_sold} bookings</Text>
                    </View>
                  </View>
                </View>
                <View style={twStyle("items-end")}>
                  <Text style={twStyle("text-base font-bold text-gray-900")}>
                    {formatCurrency(pkg.total_revenue)}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-[10px] text-gray-400")}>booked value</Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </ScreenContainer>
  );
}
