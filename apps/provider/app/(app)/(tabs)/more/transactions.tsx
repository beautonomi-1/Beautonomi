import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { Redirect, useRouter } from "expo-router";
import { useProviderStackBack } from "@/lib/provider-tab-navigation";
import { View, Text, TouchableOpacity, Alert, Share, ScrollView, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiPost, MONEY_SURFACE_STALE_TIME_MS, MONEY_SURFACE_TIMEOUT_MS } from "@/hooks/useApi";
import { useFocusRevalidate } from "@/hooks/useFocusRevalidate";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { FinanceReportError } from "@/components/finance/FinanceReportError";
import { TruncationBanner } from "@/components/finance/TruncationBanner";
import { MoneyRangeChips, type MoneyRangeKey } from "@/components/finance/MoneyRangeChips";
import { formatLedgerUiBucket } from "@/lib/financeLabels";
import { formatCurrency, formatDate, formatTimeAgo } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

interface Transaction {
  id: string;
  /** Ledger-derived UI bucket from GET /api/provider/transactions */
  type: string;
  /** +1 credit / -1 debit (used for ledger adjustments). */
  sign?: 1 | -1;
  amount: number;
  description: string;
  status: string;
  created_at: string;
  client_name: string | null;
  payment_method: string | null;
  reference: string | null;
  booking_id: string | null;
  notes: string | null;
  transaction_type?: string;
}


const TYPE_FILTER_KEYS = [
  { labelKey: "filterAll", value: "all" },
  { labelKey: "filterEarnings", value: "earning" },
  { labelKey: "filterFees", value: "fee" },
  { labelKey: "filterPayouts", value: "payout" },
  { labelKey: "filterRefunds", value: "refund" },
  { labelKey: "filterTips", value: "tip" },
  { labelKey: "filterLedger", value: "adjustment" },
] as const;

function txnIcon(type: string): {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
} {
  switch (type) {
    case "earning":
      return { name: "arrow-down-outline", color: "#22c55e", bg: "bg-green-50" };
    case "payout":
      return { name: "arrow-up-outline", color: "#3b82f6", bg: "bg-blue-50" };
    case "fee":
      return { name: "remove-circle-outline", color: "#f59e0b", bg: "bg-amber-50" };
    case "refund":
      return { name: "return-down-back-outline", color: "#ef4444", bg: "bg-red-50" };
    case "tip":
      return { name: "heart-outline", color: "#ec4899", bg: "bg-pink-50" };
    case "adjustment":
      return { name: "git-network-outline", color: "#64748b", bg: "bg-slate-50" };
    default:
      return { name: "swap-horizontal-outline", color: "#6b7280", bg: "bg-gray-50" };
  }
}

function isDebitType(t: Transaction): boolean {
  if (t.type === "adjustment") return t.sign === -1;
  return t.type === "payout" || t.type === "fee" || t.type === "refund";
}

function signedContributionForSummary(t: Transaction): number {
  if (t.type === "earning" || t.type === "tip") return t.amount;
  if (t.type === "payout" || t.type === "refund" || t.type === "fee") return -t.amount;
  if (t.type === "adjustment") return (t.sign ?? 1) * t.amount;
  return 0;
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
    case "paycloud": return "hardware-chip-outline";
    default: return "wallet-outline";
  }
}

function paymentMethodLabel(method: string | null, other: string, cardMachine: string): string {
  if (method === "paycloud") return cardMachine;
  return method ?? other;
}

export function TransactionsContent({
  embedded = false,
  locationId = null,
}: { embedded?: boolean; locationId?: string | null } = {}) {
  const { t } = useTranslation();
  const tx = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.transactions.${key}`, opts) as string,
    [t],
  );
  const typeFilters = useMemo(
    () => TYPE_FILTER_KEYS.map((o) => ({ label: tx(o.labelKey), value: o.value })),
    [tx],
  );
  const router = useRouter();
  const handleBack = useProviderStackBack();
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<MoneyRangeKey>("month");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [listLimit, setListLimit] = useState(50);
  const MAX_LIST_LIMIT = 500;

  interface TransactionsApiPayload {
    transactions?: Transaction[];
    summary?: {
      total_in: number;
      total_out: number;
      net: number;
      row_count: number;
      basis_note?: string;
    };
    truncated_list?: boolean;
    truncated_ledger?: boolean;
    list_offset?: number;
    list_total?: number;
  }

  const transactionsPath = `/api/provider/transactions?period=${period}&limit=${listLimit}&offset=0${
    locationId ? `&location_id=${encodeURIComponent(locationId)}` : ""
  }${typeFilter !== "all" ? `&type=${encodeURIComponent(typeFilter)}` : ""}`;

  /** Branch-scoped when a location is selected (matches Sales / Overview aggregates). */
  const { data: txnPayload, loading, error: txnError, errorCode, refresh, silentRefresh } = useApi<
    TransactionsApiPayload | Transaction[]
  >(transactionsPath, {
    staleTimeMs: MONEY_SURFACE_STALE_TIME_MS,
    revalidateOnFocus: true,
    timeoutMs: MONEY_SURFACE_TIMEOUT_MS,
  });
  useFocusRevalidate(silentRefresh);

  const transactions = useMemo(() => {
    if (!txnPayload) return [];
    if (Array.isArray(txnPayload)) return txnPayload;
    return txnPayload.transactions ?? [];
  }, [txnPayload]);

  const serverSummary = useMemo(() => {
    if (!txnPayload || Array.isArray(txnPayload)) return null;
    return txnPayload.summary ?? null;
  }, [txnPayload]);

  const showTruncationBanner = useMemo(() => {
    if (!txnPayload || Array.isArray(txnPayload)) return false;
    return Boolean(txnPayload.truncated_ledger);
  }, [txnPayload]);

  const listTotal = useMemo(() => {
    if (!txnPayload || Array.isArray(txnPayload)) return transactions.length;
    return txnPayload.list_total ?? transactions.length;
  }, [txnPayload, transactions.length]);

  useEffect(() => {
    setListLimit(50);
  }, [period, locationId, typeFilter]);

  const canLoadMore = listTotal > listLimit && listLimit < MAX_LIST_LIMIT && !search.trim();
  const { execute: exportTransactions, loading: exporting } = useApiPost<
    { period: string; format: string; location_id?: string },
    { url?: string; csv?: string; filename?: string; row_count?: number; truncated?: boolean }
  >("/api/provider/transactions/export");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    let list = transactions ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => {
        const desc = String(t.description ?? "").toLowerCase();
        return (
          desc.includes(q) ||
          t.client_name?.toLowerCase().includes(q) ||
          t.reference?.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [transactions, search]);

  const useServerSummary = Boolean(serverSummary) && !search.trim();

  const totalIn = useMemo(() => {
    if (useServerSummary) return serverSummary!.total_in;
    return filtered
      .filter((t) => t.type === "earning" || t.type === "tip")
      .reduce((s, t) => s + t.amount, 0);
  }, [filtered, useServerSummary, serverSummary]);

  const totalOut = useMemo(() => {
    if (useServerSummary) return serverSummary!.total_out;
    return filtered
      .filter((t) => t.type === "payout" || t.type === "refund")
      .reduce((s, t) => s + t.amount, 0);
  }, [filtered, useServerSummary, serverSummary]);

  const netAmount = useMemo(() => {
    if (useServerSummary) return serverSummary!.net;
    return filtered.reduce((s, t) => s + signedContributionForSummary(t), 0);
  }, [filtered, useServerSummary, serverSummary]);

  async function handleExport() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { data, error } = await exportTransactions({
      period,
      format: "csv",
      ...(locationId ? { location_id: locationId } : {}),
    });
    if (error) {
      Alert.alert(tx("exportFailed"), error);
      return;
    }
    const reportTitle = data?.filename ?? tx("reportTitle");
    if (data?.csv) {
      await Share.share({
        title: reportTitle,
        message: data.truncated
          ? `${reportTitle}\n\n${data.csv}\n\n${tx("exportCappedNote")}`
          : `${reportTitle}\n\n${data.csv}`,
      });
    } else if (data?.url) {
      await Share.share({
        message: tx("shareUrlMessage", { period }),
        url: data.url,
      });
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(tx("exportedTitle"), tx("exportedBody"));
    }
  }

  const renderTransactionItem = (item: Transaction) => {
    const ic = txnIcon(item.type);
    const isDebit = isDebitType(item);
    const ss = statusStyle(item.status);

    return (
      <TouchableOpacity
        key={item.id}
        style={twStyle("mb-1.5 flex-row items-center rounded-xl border border-gray-100 bg-white p-3.5")}
        onPress={() => setSelectedTxn(item)}
        activeOpacity={0.7}
      >
        <View style={twStyle(`h-10 w-10 items-center justify-center rounded-xl ${ic.bg}`)}>
          <Ionicons name={ic.name} size={18} color={ic.color} />
        </View>
        <View style={twStyle("ms-3 flex-1")}>
          <Text style={twStyle("text-sm font-medium text-gray-900")} numberOfLines={1}>
            {item.description}
          </Text>
          <View style={twStyle("mt-0.5 flex-row items-center")}>
            <Text style={[twStyle("text-xs text-gray-400"), { marginEnd: 8 }]}>
              {formatTimeAgo(item.created_at)}
            </Text>
            {item.client_name && (
              <Text style={twStyle("text-xs text-gray-400")} numberOfLines={1}>
                • {item.client_name}
              </Text>
            )}
          </View>
        </View>
        <View style={twStyle("items-end ms-2")}>
          <Text
            style={twStyle(`text-sm font-bold ${
              item.type === "adjustment"
                ? "text-slate-600"
                : isDebit
                  ? "text-red-600"
                  : "text-green-600"
            }`)}
          >
            {item.type === "adjustment"
              ? (item.sign === -1 ? "-" : "+")
              : isDebit
                ? "-"
                : "+"}
            {formatCurrency(item.amount)}
          </Text>
          <View style={twStyle(`mt-0.5 rounded-full px-1.5 py-0.5 ${ss.bg}`)}>
            <Text style={twStyle(`text-[9px] font-medium capitalize ${ss.text}`)}>
              {item.status}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const content = (
      <ScrollView
        style={embedded ? twStyle("flex-1") : undefined}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
      {!embedded ? (
        <ScreenHeader
          title={tx("title")}
          showBack
          onBack={handleBack}
          subtitle={tx("subtitle", { count: filtered.length })}
          rightAction={
            <TouchableOpacity
              style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
              onPress={handleExport}
              disabled={exporting}
            >
              <Ionicons name="download-outline" size={18} color="#374151" />
            </TouchableOpacity>
          }
        />
      ) : (
        <View style={twStyle("mb-2 flex-row items-center justify-end px-4")}>
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
            onPress={handleExport}
            disabled={exporting}
            accessibilityLabel={tx("exportCsvA11y")}
          >
            <Ionicons name="download-outline" size={18} color="#374151" />
          </TouchableOpacity>
        </View>
      )}

      {showTruncationBanner ? (
        <View style={twStyle("px-4")}>
          <TruncationBanner message={tx("truncationBanner")} />
        </View>
      ) : null}

      {serverSummary?.basis_note && !search.trim() ? (
        <View style={twStyle("mb-3 px-4")}>
          <Text style={twStyle("text-xs leading-5 text-gray-500")}>{serverSummary.basis_note}</Text>
        </View>
      ) : null}

      {listTotal > 0 ? (
        <View style={twStyle("mb-2 px-4")}>
          <Text style={twStyle("text-xs text-gray-500")}>
            {tx("showingOf", { shown: Math.min(filtered.length, listLimit), total: listTotal })}
          </Text>
        </View>
      ) : null}

      {canLoadMore ? (
        <View style={twStyle("mb-3 px-4")}>
          <TouchableOpacity
            style={twStyle("items-center rounded-xl border border-gray-200 bg-white py-3")}
            onPress={() => setListLimit((prev) => Math.min(prev + 50, MAX_LIST_LIMIT))}
          >
            <Text style={twStyle("text-sm font-medium text-gray-700")}>{tx("loadMore")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Summary cards */}
      <View style={twStyle("mb-3 flex-row")}>
        <View style={[twStyle("flex-1 rounded-xl border border-green-100 bg-green-50 p-3"), { marginEnd: 8 }]}>
          <Text style={twStyle("text-[10px] font-medium text-green-600")}>{tx("earningsAndTips")}</Text>
          <Text style={twStyle("text-base font-bold text-green-700")}>
            {formatCurrency(totalIn)}
          </Text>
        </View>
        <View style={[twStyle("flex-1 rounded-xl border border-red-100 bg-red-50 p-3"), { marginEnd: 8 }]}>
          <Text style={twStyle("text-[10px] font-medium text-red-600")}>{tx("payoutsAndRefunds")}</Text>
          <Text style={twStyle("text-base font-bold text-red-700")}>
            {formatCurrency(totalOut)}
          </Text>
        </View>
        <View
          style={twStyle(`flex-1 rounded-xl border p-3 ${
            netAmount >= 0 ? "border-blue-100 bg-blue-50" : "border-orange-100 bg-orange-50"
          }`)}
        >
          <Text
            style={twStyle(`text-[10px] font-medium ${
              netAmount >= 0 ? "text-blue-600" : "text-orange-600"
            }`)}
          >
            {tx("net")}
          </Text>
          <Text
            style={twStyle(`text-base font-bold ${
              netAmount >= 0 ? "text-blue-700" : "text-orange-700"
            }`)}
          >
            {netAmount < 0 ? "−" : ""}
            {formatCurrency(Math.abs(netAmount))}
          </Text>
        </View>
      </View>

      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder={tx("searchPlaceholder")}
      />

      <MoneyRangeChips value={period} onChange={setPeriod} />
      <View style={twStyle("mb-3")}>
        <FilterChipGroup options={typeFilters} selected={typeFilter} onSelect={setTypeFilter} />
      </View>

      {loading && !txnPayload ? (
        <SkeletonList rows={6} />
      ) : txnError ? (
        <FinanceReportError error={txnError} errorCode={errorCode} onRetry={refresh} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="swap-horizontal-outline"
          title={tx("emptyTitle")}
          description={
            search || typeFilter !== "all"
              ? tx("emptyFiltered")
              : period !== "all"
                ? tx("emptyPeriod")
                : tx("emptyAll")
          }
          actionLabel={period !== "all" && !search && typeFilter === "all" ? tx("showAllTime") : undefined}
          onAction={period !== "all" && !search && typeFilter === "all" ? () => setPeriod("all") : undefined}
        />
      ) : (
        <View>
          {filtered.map((item, idx) => (
            <View key={item.id} style={idx > 0 ? { marginTop: 6 } : undefined}>
              {renderTransactionItem(item)}
            </View>
          ))}
        </View>
      )}

      {/* Transaction detail */}
      <BottomSheet
        visible={!!selectedTxn}
        onClose={() => setSelectedTxn(null)}
        title={tx("detailsTitle")}
      >
        {selectedTxn && (
          <View>
            <View style={twStyle("mb-4 items-center")}>
              <View
                style={twStyle(`h-14 w-14 items-center justify-center rounded-2xl ${txnIcon(selectedTxn.type).bg}`)}
              >
                <Ionicons
                  name={txnIcon(selectedTxn.type).name}
                  size={28}
                  color={txnIcon(selectedTxn.type).color}
                />
              </View>
              <Text
                style={twStyle(`mt-2 text-2xl font-bold ${
                  selectedTxn.type === "adjustment"
                    ? "text-slate-700"
                    : isDebitType(selectedTxn)
                      ? "text-red-600"
                      : "text-green-600"
                }`)}
              >
                {selectedTxn.type === "adjustment"
                  ? selectedTxn.sign === -1
                    ? "-"
                    : "+"
                  : isDebitType(selectedTxn)
                    ? "-"
                    : "+"}
                {formatCurrency(selectedTxn.amount)}
              </Text>
              <Text style={twStyle("mt-1 text-sm text-gray-500")}>{selectedTxn.description}</Text>
            </View>

            <View style={twStyle("mb-4 rounded-xl bg-gray-50 p-4")}>
              <View style={twStyle("mb-3 flex-row justify-between")}>
                <Text style={twStyle("text-xs text-gray-500")}>{tx("type")}</Text>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>
                  {formatLedgerUiBucket(selectedTxn.type)}
                </Text>
              </View>
              {selectedTxn.transaction_type ? (
                <View style={twStyle("mb-3 flex-row justify-between")}>
                  <Text style={twStyle("text-xs text-gray-500")}>{tx("ledger")}</Text>
                  <Text style={twStyle("text-xs font-mono text-gray-600")} selectable>
                    {selectedTxn.transaction_type}
                  </Text>
                </View>
              ) : null}
              <View style={twStyle("mb-3 flex-row justify-between")}>
                <Text style={twStyle("text-xs text-gray-500")}>{tx("status")}</Text>
                <View style={twStyle(`rounded-full px-2 py-0.5 ${statusStyle(selectedTxn.status).bg}`)}>
                  <Text style={twStyle(`text-xs font-medium capitalize ${statusStyle(selectedTxn.status).text}`)}>
                    {selectedTxn.status}
                  </Text>
                </View>
              </View>
              <View style={twStyle("mb-3 flex-row justify-between")}>
                <Text style={twStyle("text-xs text-gray-500")}>{tx("date")}</Text>
                <Text style={twStyle("text-sm text-gray-900")}>
                  {formatDate(selectedTxn.created_at)}
                </Text>
              </View>
              {selectedTxn.client_name && (
                <View style={twStyle("mb-3 flex-row justify-between")}>
                  <Text style={twStyle("text-xs text-gray-500")}>{tx("client")}</Text>
                  <Text style={twStyle("text-sm text-gray-900")}>{selectedTxn.client_name}</Text>
                </View>
              )}
              {selectedTxn.payment_method && (
                <View style={twStyle("mb-3 flex-row items-center justify-between")}>
                  <Text style={twStyle("text-xs text-gray-500")}>{tx("paymentMethod")}</Text>
                  <View style={twStyle("flex-row items-center")}>
                    <Ionicons
                      name={paymentMethodIcon(selectedTxn.payment_method)}
                      size={14}
                      color="#6b7280"
                    />
                    <Text style={twStyle("ms-1 text-sm capitalize text-gray-900")}>
                      {paymentMethodLabel(selectedTxn.payment_method, tx("paymentOther"), tx("paymentCardMachine"))}
                    </Text>
                  </View>
                </View>
              )}
              {selectedTxn.payment_method === "paycloud" && (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedTxn(null);
                    router.push("/(app)/(tabs)/more/card-machines" as never);
                  }}
                  style={twStyle("mb-3 self-end")}
                >
                  <Text style={twStyle("text-xs font-medium text-violet-700")}>
                    {tx("manageCardMachines")}
                  </Text>
                </TouchableOpacity>
              )}
              {selectedTxn.reference && (
                <View style={twStyle("flex-row justify-between")}>
                  <Text style={twStyle("text-xs text-gray-500")}>{tx("reference")}</Text>
                  <Text style={twStyle("text-sm font-mono text-gray-700")} selectable>
                    {selectedTxn.reference}
                  </Text>
                </View>
              )}
            </View>

            {selectedTxn.notes && (
              <View style={twStyle("mb-4")}>
                <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>{tx("notes")}</Text>
                <Text style={twStyle("text-sm leading-5 text-gray-700")}>{selectedTxn.notes}</Text>
              </View>
            )}

            <TouchableOpacity
              style={twStyle("flex-row items-center justify-center rounded-xl bg-gray-100 py-3")}
              onPress={async () => {
                await Share.share({
                  message: tx("shareMessage", {
                    description: selectedTxn.description,
                    amount: formatCurrency(selectedTxn.amount),
                    date: formatDate(selectedTxn.created_at),
                    ref: selectedTxn.reference ?? tx("refNa"),
                  }),
                });
              }}
            >
              <Ionicons name="share-outline" size={16} color="#374151" />
              <Text style={twStyle("ms-1.5 text-sm font-medium text-gray-700")}>{tx("shareReceipt")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </BottomSheet>
      </ScrollView>
  );

  if (embedded) {
    return <View style={twStyle("flex-1")}>{content}</View>;
  }

  return <ScreenContainer scrollable={false}>{content}</ScreenContainer>;
}

export default function TransactionsScreen() {
  return <Redirect href="/(app)/(tabs)/more/money?tab=ledger" />;
}
