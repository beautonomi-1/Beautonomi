import { useState, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, Alert, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency, formatDate, formatTimeAgo } from "@/lib/format";

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  status: string;
  created_at: string;
  client_name: string | null;
  payment_method: string | null;
  reference: string | null;
  booking_id: string | null;
  notes: string | null;
}

const PERIOD_FILTERS = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "3 Months", value: "3months" },
  { label: "All Time", value: "all" },
];

const TYPE_FILTERS = [
  { label: "All", value: "all" },
  { label: "Payments", value: "payment" },
  { label: "Payouts", value: "payout" },
  { label: "Fees", value: "fee" },
  { label: "Refunds", value: "refund" },
  { label: "Tips", value: "tip" },
];

function txnIcon(type: string): {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
} {
  switch (type) {
    case "payment":
      return { name: "arrow-down-outline", color: "#22c55e", bg: "bg-green-50" };
    case "payout":
      return { name: "arrow-up-outline", color: "#3b82f6", bg: "bg-blue-50" };
    case "fee":
      return { name: "remove-circle-outline", color: "#f59e0b", bg: "bg-amber-50" };
    case "refund":
      return { name: "return-down-back-outline", color: "#ef4444", bg: "bg-red-50" };
    case "tip":
      return { name: "heart-outline", color: "#ec4899", bg: "bg-pink-50" };
    default:
      return { name: "swap-horizontal-outline", color: "#6b7280", bg: "bg-gray-50" };
  }
}

function statusStyle(s: string) {
  if (s === "completed" || s === "succeeded") return { bg: "bg-green-50", text: "text-green-700" };
  if (s === "pending") return { bg: "bg-amber-50", text: "text-amber-700" };
  if (s === "failed") return { bg: "bg-red-50", text: "text-red-700" };
  if (s === "refunded") return { bg: "bg-orange-50", text: "text-orange-700" };
  return { bg: "bg-gray-100", text: "text-gray-500" };
}

function paymentMethodIcon(method: string | null): keyof typeof Ionicons.glyphMap {
  switch (method) {
    case "card": return "card-outline";
    case "cash": return "cash-outline";
    case "eft": return "swap-horizontal-outline";
    case "yoco": return "hardware-chip-outline";
    default: return "wallet-outline";
  }
}

export default function TransactionsScreen() {
  const { isTablet } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState("month");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  const { data: transactions, loading, refresh } = useApi<Transaction[]>(
    `/api/provider/transactions?period=${period}&limit=200`
  );
  const { execute: exportTransactions, loading: exporting } = useApiPost<
    { period: string; format: string },
    { url: string }
  >("/api/provider/transactions/export");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const filtered = useMemo(() => {
    let list = transactions ?? [];
    if (typeFilter !== "all") {
      list = list.filter((t) => t.type === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.client_name?.toLowerCase().includes(q) ||
          t.reference?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, typeFilter, search]);

  const totalIn = useMemo(
    () =>
      (transactions ?? [])
        .filter((t) => t.type === "payment" || t.type === "tip")
        .reduce((s, t) => s + t.amount, 0),
    [transactions]
  );

  const totalOut = useMemo(
    () =>
      (transactions ?? [])
        .filter((t) => t.type === "payout" || t.type === "fee" || t.type === "refund")
        .reduce((s, t) => s + t.amount, 0),
    [transactions]
  );

  const netAmount = totalIn - totalOut;

  async function handleExport() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { data, error } = await exportTransactions({ period, format: "csv" });
    if (error) {
      Alert.alert("Export Failed", error);
      return;
    }
    if (data?.url) {
      await Share.share({
        message: `Transaction report for ${period}`,
        url: data.url,
      });
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Exported", "Transaction report has been sent to your email.");
    }
  }

  const renderTransactionItem = (item: Transaction) => {
    const ic = txnIcon(item.type);
    const isDebit =
      item.type === "payout" || item.type === "fee" || item.type === "refund";
    const ss = statusStyle(item.status);

    return (
      <TouchableOpacity
        key={item.id}
        className="mb-1.5 flex-row items-center rounded-xl border border-gray-100 bg-white p-3.5"
        onPress={() => setSelectedTxn(item)}
        activeOpacity={0.7}
      >
        <View className={`h-10 w-10 items-center justify-center rounded-xl ${ic.bg}`}>
          <Ionicons name={ic.name} size={18} color={ic.color} />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>
            {item.description}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-2">
            <Text className="text-xs text-gray-400">
              {formatTimeAgo(item.created_at)}
            </Text>
            {item.client_name && (
              <Text className="text-xs text-gray-400" numberOfLines={1}>
                • {item.client_name}
              </Text>
            )}
          </View>
        </View>
        <View className="items-end ml-2">
          <Text
            className={`text-sm font-bold ${
              isDebit ? "text-red-600" : "text-green-600"
            }`}
          >
            {isDebit ? "-" : "+"}
            {formatCurrency(item.amount)}
          </Text>
          <View className={`mt-0.5 rounded-full px-1.5 py-0.5 ${ss.bg}`}>
            <Text className={`text-[9px] font-medium capitalize ${ss.text}`}>
              {item.status}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer
      scrollable={true}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      <ScreenHeader
        title="Transactions"
        showBack
        subtitle={`${filtered.length} transaction${filtered.length !== 1 ? "s" : ""}`}
        rightAction={
          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-full bg-gray-100"
            onPress={handleExport}
            disabled={exporting}
          >
            <Ionicons name="download-outline" size={18} color="#374151" />
          </TouchableOpacity>
        }
      />

      {/* Summary cards */}
      <View className={`mb-3 gap-2 ${isTablet ? "flex-row" : "flex-row"}`}>
        <View className="flex-1 rounded-xl border border-green-100 bg-green-50 p-3">
          <Text className="text-[10px] font-medium text-green-600">Income</Text>
          <Text className="text-base font-bold text-green-700">
            {formatCurrency(totalIn)}
          </Text>
        </View>
        <View className="flex-1 rounded-xl border border-red-100 bg-red-50 p-3">
          <Text className="text-[10px] font-medium text-red-600">Outgoing</Text>
          <Text className="text-base font-bold text-red-700">
            {formatCurrency(totalOut)}
          </Text>
        </View>
        <View
          className={`flex-1 rounded-xl border p-3 ${
            netAmount >= 0 ? "border-blue-100 bg-blue-50" : "border-orange-100 bg-orange-50"
          }`}
        >
          <Text
            className={`text-[10px] font-medium ${
              netAmount >= 0 ? "text-blue-600" : "text-orange-600"
            }`}
          >
            Net
          </Text>
          <Text
            className={`text-base font-bold ${
              netAmount >= 0 ? "text-blue-700" : "text-orange-700"
            }`}
          >
            {formatCurrency(Math.abs(netAmount))}
          </Text>
        </View>
      </View>

      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search transactions..."
      />

      <View className="mt-2 mb-1">
        <FilterChipGroup options={PERIOD_FILTERS} selected={period} onSelect={setPeriod} />
      </View>
      <View className="mb-3">
        <FilterChipGroup options={TYPE_FILTERS} selected={typeFilter} onSelect={setTypeFilter} />
      </View>

      {loading && !transactions ? (
        <SkeletonList rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="swap-horizontal-outline"
          title="No transactions"
          description={
            search || typeFilter !== "all"
              ? "Try adjusting your search or filters"
              : "Financial transactions will appear here"
          }
        />
      ) : (
        <View className="gap-1.5">
          {filtered.map((item) => renderTransactionItem(item))}
        </View>
      )}

      {/* Transaction detail */}
      <BottomSheet
        visible={!!selectedTxn}
        onClose={() => setSelectedTxn(null)}
        title="Transaction Details"
      >
        {selectedTxn && (
          <View>
            <View className="mb-4 items-center">
              <View
                className={`h-14 w-14 items-center justify-center rounded-2xl ${txnIcon(selectedTxn.type).bg}`}
              >
                <Ionicons
                  name={txnIcon(selectedTxn.type).name}
                  size={28}
                  color={txnIcon(selectedTxn.type).color}
                />
              </View>
              <Text
                className={`mt-2 text-2xl font-bold ${
                  selectedTxn.type === "payout" || selectedTxn.type === "fee" || selectedTxn.type === "refund"
                    ? "text-red-600"
                    : "text-green-600"
                }`}
              >
                {selectedTxn.type === "payout" || selectedTxn.type === "fee" || selectedTxn.type === "refund"
                  ? "-"
                  : "+"}
                {formatCurrency(selectedTxn.amount)}
              </Text>
              <Text className="mt-1 text-sm text-gray-500">{selectedTxn.description}</Text>
            </View>

            <View className="mb-4 rounded-xl bg-gray-50 p-4">
              <View className="mb-3 flex-row justify-between">
                <Text className="text-xs text-gray-500">Type</Text>
                <Text className="text-sm font-medium capitalize text-gray-900">
                  {selectedTxn.type}
                </Text>
              </View>
              <View className="mb-3 flex-row justify-between">
                <Text className="text-xs text-gray-500">Status</Text>
                <View className={`rounded-full px-2 py-0.5 ${statusStyle(selectedTxn.status).bg}`}>
                  <Text className={`text-xs font-medium capitalize ${statusStyle(selectedTxn.status).text}`}>
                    {selectedTxn.status}
                  </Text>
                </View>
              </View>
              <View className="mb-3 flex-row justify-between">
                <Text className="text-xs text-gray-500">Date</Text>
                <Text className="text-sm text-gray-900">
                  {formatDate(selectedTxn.created_at)}
                </Text>
              </View>
              {selectedTxn.client_name && (
                <View className="mb-3 flex-row justify-between">
                  <Text className="text-xs text-gray-500">Client</Text>
                  <Text className="text-sm text-gray-900">{selectedTxn.client_name}</Text>
                </View>
              )}
              {selectedTxn.payment_method && (
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="text-xs text-gray-500">Payment Method</Text>
                  <View className="flex-row items-center">
                    <Ionicons
                      name={paymentMethodIcon(selectedTxn.payment_method)}
                      size={14}
                      color="#6b7280"
                    />
                    <Text className="ml-1 text-sm capitalize text-gray-900">
                      {selectedTxn.payment_method}
                    </Text>
                  </View>
                </View>
              )}
              {selectedTxn.reference && (
                <View className="flex-row justify-between">
                  <Text className="text-xs text-gray-500">Reference</Text>
                  <Text className="text-sm font-mono text-gray-700" selectable>
                    {selectedTxn.reference}
                  </Text>
                </View>
              )}
            </View>

            {selectedTxn.notes && (
              <View className="mb-4">
                <Text className="mb-1 text-xs font-medium text-gray-500">Notes</Text>
                <Text className="text-sm leading-5 text-gray-700">{selectedTxn.notes}</Text>
              </View>
            )}

            <TouchableOpacity
              className="flex-row items-center justify-center rounded-xl bg-gray-100 py-3"
              onPress={async () => {
                await Share.share({
                  message: `Transaction: ${selectedTxn.description}\nAmount: ${formatCurrency(selectedTxn.amount)}\nDate: ${formatDate(selectedTxn.created_at)}\nRef: ${selectedTxn.reference ?? "N/A"}`,
                });
              }}
            >
              <Ionicons name="share-outline" size={16} color="#374151" />
              <Text className="ml-1.5 text-sm font-medium text-gray-700">Share Receipt</Text>
            </TouchableOpacity>
          </View>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}
