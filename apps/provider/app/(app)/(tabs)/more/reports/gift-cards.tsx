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
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

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
  { label: "This Month", value: "month" },
  { label: "This Week", value: "week" },
  { label: "Today", value: "today" },
];

export default function GiftCardReportScreen() {
  const { selectedLocationId } = useProvider();
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState("month");

  const giftCardsUrl = `/api/provider/reports/gift-cards?period=${period}${selectedLocationId ? `&location_id=${encodeURIComponent(selectedLocationId)}` : ""}`;
  const { data: reportData, loading, refresh } = useApi<{
    stats: GiftCardStats;
    cards: GiftCardReport[];
  }>(giftCardsUrl);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const stats = reportData?.stats;
  const cards = reportData?.cards ?? [];

  async function handleExport() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const rows = cards.map(
      (c) =>
        `${c.code},${c.purchaser_name ?? ""},${c.recipient_name ?? ""},${formatCurrency(c.initial_value)},${formatCurrency(c.remaining_value)},${c.status},${formatDate(c.purchased_at)}`
    );
    const csv = `Code,Purchaser,Recipient,Value,Remaining,Status,Date\n${rows.join("\n")}`;
    try {
      await Share.share({ message: csv, title: "Gift Card Report" });
    } catch {}
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Gift Card Report"
        showBack
        subtitle="Sales & redemption analytics"
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
          <StatCard
            title="Total Sold"
            value={String(stats?.total_sold ?? 0)}
            icon="gift-outline"
            iconColor="#a855f7"
            iconBg="bg-purple-50"
            compact
          />
        </View>
        <View style={twStyle("flex-1")}>
          <StatCard
            title="Revenue"
            value={formatCurrency(stats?.total_revenue ?? 0)}
            icon="cash-outline"
            iconColor="#22c55e"
            iconBg="bg-green-50"
            compact
          />
        </View>
        <View style={twStyle("flex-1")}>
          <StatCard
            title="Outstanding"
            value={formatCurrency(stats?.total_outstanding ?? 0)}
            icon="hourglass-outline"
            iconColor="#f59e0b"
            iconBg="bg-amber-50"
            compact
          />
        </View>
      </View>

      <View style={twStyle("mb-3 flex-row")}>
        <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
          <StatCard
            title="Redeemed"
            value={formatCurrency(stats?.total_redeemed ?? 0)}
            icon="checkmark-circle-outline"
            iconColor="#6366f1"
            iconBg="bg-indigo-50"
            compact
          />
        </View>
        <View style={twStyle("flex-1")}>
          <StatCard
            title="Avg Value"
            value={formatCurrency(stats?.avg_value ?? 0)}
            icon="analytics-outline"
            iconColor="#3b82f6"
            iconBg="bg-blue-50"
            compact
          />
        </View>
        <View style={twStyle("flex-1")}>
          <StatCard
            title="Active"
            value={String(stats?.active_count ?? 0)}
            icon="radio-button-on"
            iconColor="#10b981"
            iconBg="bg-emerald-50"
            compact
          />
        </View>
      </View>

      <View style={twStyle("mb-3")}>
        <FilterChipGroup options={PERIOD_FILTERS} selected={period} onSelect={setPeriod} />
      </View>

      {loading && !reportData ? (
        <SkeletonList rows={5} />
      ) : cards.length === 0 ? (
        <EmptyState icon="gift-outline" title="No gift card data" description="Gift card transactions will appear here" />
      ) : (
        <FlatList
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
                  <Text style={twStyle("mt-0.5 text-xs text-gray-400")}>{formatDate(card.purchased_at)}</Text>
                </View>
                <View style={twStyle("items-end")}>
                  <Text style={twStyle("text-sm font-bold text-gray-900")}>{formatCurrency(card.initial_value)}</Text>
                  <Text style={twStyle("text-xs text-gray-500")}>
                    {formatCurrency(card.remaining_value)} left
                  </Text>
                  <View style={twStyle(`mt-1 rounded-full px-2 py-0.5 ${
                    card.status === "active" ? "bg-green-50" : card.status === "redeemed" ? "bg-blue-50" : "bg-gray-100"
                  }`)}>
                    <Text style={twStyle(`text-[10px] font-medium capitalize ${
                      card.status === "active" ? "text-green-700" : card.status === "redeemed" ? "text-blue-700" : "text-gray-500"
                    }`)}>
                      {card.status}
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
