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
import { formatCurrency, formatDate, formatStatusLabel } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { ReportResponsiveStatRow } from "@/components/reports/ReportResponsiveStatRow";

interface GiftCardReport {
  id: string;
  code: string;
  initial_value: number;
  remaining_value: number;
  status: string;
  purchaser_name: string | null;
  recipient_name: string | null;
  purchased_at: string;
  redeemed_at: string | null;
  captured_at?: string | null;
  expires_at: string | null;
}

interface GiftCardStats {
  total_sold: number;
  total_revenue: number;
  total_redeemed: number;
  total_outstanding: number;
  active_count: number;
  expired_count: number;
  avg_value: number;
}

const PERIOD_FILTERS = [
  { label: "All Time", value: "all" },
  { label: "Last 30 days", value: "month" },
  { label: "Last 7 days", value: "week" },
  { label: "Today", value: "today" },
];

export default function GiftCardReportScreen() {
  const { selectedLocationId } = useProvider();
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState("month");

  const giftCardsUrl = appendReportLocation(`/api/provider/reports/gift-cards?period=${period}`, selectedLocationId);
  const { data: reportData, loading, error: dataError, refresh } = useApi<{
    stats: GiftCardStats;
    cards: GiftCardReport[];
    reportBasis?: string;
    basis?: Record<string, string>;
  }>(giftCardsUrl);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const stats = reportData?.stats;
  const cards = reportData?.cards ?? [];
  const basis = typeof reportData?.reportBasis === "string" ? reportData.reportBasis : "";

  async function handleExport() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const rows = cards.map(
      (c) =>
        `${c.code},${c.purchaser_name ?? ""},${c.recipient_name ?? ""},${formatCurrency(c.initial_value)},${c.status},${formatDate(c.purchased_at)},${c.redeemed_at ?? c.captured_at ?? ""}`
    );
    const csv = `Code,Purchaser,Recipient,Redemption amount,Status,Purchased,Capture\n${rows.join("\n")}`;
    try {
      await Share.share({ message: csv, title: "Gift Card Report" });
    } catch {}
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Gift cards"
        showBack
        subtitle="Redemptions at your business (platform sells cards)"
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
            onPress={handleExport}
          >
            <Ionicons name="download-outline" size={18} color="#374151" />
          </TouchableOpacity>
        }
      />

      {basis ? (
        <View style={twStyle("mb-3 rounded-2xl border border-sky-100 bg-sky-50/95 px-4 py-3")}>
          <Text style={twStyle("text-xs font-semibold uppercase text-sky-900")}>What this counts</Text>
          <Text style={twStyle("mt-1 text-sm leading-5 text-sky-950")}>{basis}</Text>
        </View>
      ) : null}

      <View style={twStyle("mb-3")}>
        <ReportResponsiveStatRow>
          <StatCard
            title="Redemption rows"
            value={String(stats?.total_sold ?? stats?.total_redeemed ?? 0)}
            icon="gift-outline"
            iconColor="#a855f7"
            iconBg="bg-purple-50"
            compact
          />
          <StatCard
            title="Redeemed value"
            value={formatCurrency(stats?.total_revenue ?? 0)}
            icon="cash-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            compact
          />
          <StatCard
            title="Avg / row"
            value={formatCurrency(stats?.avg_value ?? 0)}
            icon="analytics-outline"
            iconColor="#3b82f6"
            iconBg="bg-blue-50"
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
      ) : cards.length === 0 ? (
        <EmptyState
          icon="gift-outline"
          title="No gift card redemptions"
          description="Captured redemptions in this period will appear here."
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          data={cards}
          keyExtractor={(c: GiftCardReport) => c.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: card }: { item: GiftCardReport }) => (
            <View style={twStyle("rounded-xl border border-gray-100 bg-white p-4")}>
              <View style={twStyle("flex-row items-start justify-between")}>
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("text-sm font-mono font-semibold text-gray-900")}>{card.code}</Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    {card.purchaser_name ? `By ${card.purchaser_name}` : ""}
                    {card.recipient_name ? ` → ${card.recipient_name}` : ""}
                  </Text>
                  <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>
                    Capture · {formatDate(card.redeemed_at ?? card.captured_at ?? card.purchased_at)}
                  </Text>
                </View>
                <View style={twStyle("items-end")}>
                  <Text style={twStyle("text-sm font-bold text-gray-900")}>{formatCurrency(card.initial_value)}</Text>
                  <View
                    style={twStyle(`mt-1 rounded-full px-2 py-0.5 ${
                      card.status === "active" ? "bg-green-50" : card.status === "redeemed" ? "bg-blue-50" : "bg-gray-100"
                    }`)}
                  >
                    <Text
                      style={twStyle(`text-[10px] font-medium ${
                        card.status === "active" ? "text-green-700" : card.status === "redeemed" ? "text-blue-700" : "text-gray-500"
                      }`)}
                    >
                      {formatStatusLabel(card.status)}
                    </Text>
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
