import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

interface LineItem {
  id: string;
  line_item_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  description: string | null;
  client_name?: string;
  client_email?: string;
  line_items: LineItem[];
  created_at: string;
}

interface InvoicesResponse {
  invoices: Invoice[];
  total: number;
  page: number;
  total_pages: number;
}

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Paid", value: "paid" },
  { label: "Overdue", value: "overdue" },
  { label: "Draft", value: "draft" },
];

const PERIOD_FILTERS = [
  { label: "All Time", value: "all" },
  { label: "This Month", value: "month" },
  { label: "This Week", value: "week" },
];

function statusColor(status: string) {
  if (status === "paid") return { bg: "bg-green-50", text: "text-green-700", icon: "checkmark-circle" as const, color: "#22c55e" };
  if (status === "overdue") return { bg: "bg-red-50", text: "text-red-700", icon: "alert-circle" as const, color: "#ef4444" };
  if (status === "pending") return { bg: "bg-amber-50", text: "text-amber-700", icon: "hourglass" as const, color: "#f59e0b" };
  if (status === "draft") return { bg: "bg-gray-100", text: "text-gray-500", icon: "document-outline" as const, color: "#6b7280" };
  return { bg: "bg-gray-100", text: "text-gray-500", icon: "ellipse" as const, color: "#6b7280" };
}

function isThisWeek(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return d >= startOfWeek;
}

function isThisMonth(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export default function InvoicesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Invoice | null>(null);

  const statusParam = filter !== "all" ? `&status=${filter}` : "";
  const { data: invData, loading, refresh } = useApi<InvoicesResponse>(
    `/api/provider/invoices?page=${page}&limit=25${statusParam}`
  );
  const invoices = useMemo(() => invData?.invoices ?? [], [invData?.invoices]);
  const { execute: updateInvoice, loading: updatingStatus } = useApiMutation("patch");
  const { execute: sendInvoice, loading: sending } = useApiMutation("post");

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const filtered = useMemo(() => {
    let result = invoices;

    if (period === "week") result = result.filter((i) => isThisWeek(i.issue_date));
    else if (period === "month") result = result.filter((i) => isThisMonth(i.issue_date));

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.invoice_number.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q) ||
          i.client_name?.toLowerCase().includes(q) ||
          String(i.total_amount).includes(q)
      );
    }

    return result;
  }, [invoices, period, search]);

  const stats = useMemo(() => {
    const outstanding = invoices.filter((i) => i.status === "pending" || i.status === "overdue");
    const paid = invoices.filter((i) => i.status === "paid");
    const overdue = invoices.filter((i) => i.status === "overdue");
    return {
      total: invData?.total ?? invoices.length,
      outstandingAmount: outstanding.reduce((s, i) => s + i.total_amount, 0),
      paidAmount: paid.reduce((s, i) => s + i.total_amount, 0),
      overdueCount: overdue.length,
    };
  }, [invoices, invData]);

  async function handleMarkPaid(inv: Invoice) {
    Alert.alert("Mark as Paid", `Mark invoice ${inv.invoice_number} as paid?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark Paid",
        onPress: async () => {
          const { error } = await updateInvoice(`/api/provider/invoices/${inv.id}`, {
            status: "paid",
          });
          if (error) Alert.alert("Error", error);
          else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSelected(null);
            refresh();
          }
        },
      },
    ]);
  }

  async function handleSendInvoice(inv: Invoice) {
    const { error } = await sendInvoice(`/api/provider/invoices/${inv.id}/send`, {});
    if (error) Alert.alert("Error", error);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Sent", `Invoice ${inv.invoice_number} sent`);
    }
  }

  async function handleExport() {
    if (!selected) return;
    const lines = [
      `Invoice: ${selected.invoice_number}`,
      `Date: ${formatDate(selected.issue_date)}`,
      `Due: ${formatDate(selected.due_date)}`,
      `Status: ${selected.status}`,
      "",
      "Items:",
      ...selected.line_items.map(
        (li) => `  ${li.description} - ${li.quantity}x ${formatCurrency(li.unit_price)} = ${formatCurrency(li.total_price)}`
      ),
      "",
      `Subtotal: ${formatCurrency(selected.subtotal)}`,
      selected.tax_amount > 0 ? `Tax (${selected.tax_rate}%): ${formatCurrency(selected.tax_amount)}` : "",
      `Total: ${formatCurrency(selected.total_amount)}`,
    ].filter(Boolean);
    await Share.share({ message: lines.join("\n"), title: `Invoice ${selected.invoice_number}` });
  }

  async function handleExportAll() {
    if (!filtered.length) return;
    const header = "Number,Date,Due,Amount,Status";
    const rows = filtered.map(
      (i) => `${i.invoice_number},${formatDate(i.issue_date)},${formatDate(i.due_date)},${i.total_amount},${i.status}`
    );
    await Share.share({ message: [header, ...rows].join("\n"), title: "Invoices Export" });
  }

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Invoices"
        showBack
        subtitle={`${stats.total} invoices`}
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
            onPress={handleExportAll}
          >
            <Ionicons name="download-outline" size={18} color="#374151" />
          </TouchableOpacity>
        }
      />

      <View style={twStyle("mb-3 flex-row")}>
        <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
          <StatCard title="Paid" value={formatCurrency(stats.paidAmount)} icon="checkmark-circle-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
        </View>
        <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
          <StatCard title="Outstanding" value={formatCurrency(stats.outstandingAmount)} icon="alert-circle-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
        </View>
        <View style={twStyle("flex-1")}>
          <StatCard title="Overdue" value={String(stats.overdueCount)} icon="warning-outline" iconColor="#ef4444" iconBg="bg-red-50" compact />
        </View>
      </View>

      <SearchBar value={search} onChangeText={setSearch} placeholder="Search by number or client..." />

      <View style={twStyle("my-2")}>
        <FilterChipGroup
          options={STATUS_FILTERS}
          selected={filter}
          onSelect={(v) => { setFilter(v); setPage(1); }}
        />
      </View>
      <View style={twStyle("mb-3")}>
        <FilterChipGroup options={PERIOD_FILTERS} selected={period} onSelect={setPeriod} />
      </View>

      {loading && !invoices.length ? (
        <SkeletonList rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No invoices"
          description={search || filter !== "all" ? "No results for this filter" : "Platform invoices will appear here"}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i: Invoice) => i.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          onEndReached={() => {
            if (invData && page < invData.total_pages) setPage((p) => p + 1);
          }}
          onEndReachedThreshold={0.3}
          renderItem={({ item: inv }: { item: Invoice }) => {
            const sc = statusColor(inv.status);
            const isOverdue = inv.status === "overdue" || (inv.status === "pending" && new Date(inv.due_date) < new Date());
            return (
              <TouchableOpacity
                style={twStyle("rounded-xl border border-gray-100 bg-white p-4")}
                onPress={() => setSelected(inv)}
                activeOpacity={0.7}
              >
                <View style={twStyle("flex-row items-center")}>
                  <View
                    style={[twStyle("h-10 w-10 items-center justify-center rounded-xl"), { backgroundColor: sc.color + "15" }]}
                  >
                    <Ionicons name={sc.icon} size={18} color={sc.color} />
                  </View>
                  <View style={twStyle("ml-3 flex-1")}>
                    <View style={twStyle("flex-row items-center justify-between")}>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>{inv.invoice_number}</Text>
                      <Text style={twStyle("text-base font-bold text-gray-900")}>{formatCurrency(inv.total_amount)}</Text>
                    </View>
                    <View style={twStyle("flex-row items-center justify-between mt-0.5")}>
                      <View style={twStyle("flex-row items-center")}>
                        <Text style={[twStyle("text-xs text-gray-500"), { marginRight: 8 }]}>{formatDate(inv.issue_date)}</Text>
                        {inv.client_name && (
                          <Text style={twStyle("text-xs text-gray-400")}>{inv.client_name}</Text>
                        )}
                      </View>
                      <View style={twStyle(`rounded-full px-2 py-0.5 ${sc.bg}`)}>
                        <Text style={twStyle(`text-[10px] font-medium capitalize ${sc.text}`)}>
                          {isOverdue && inv.status === "pending" ? "Overdue" : inv.status}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                {inv.description && (
                  <Text style={twStyle("mt-1.5 ml-[52px] text-xs text-gray-400")} numberOfLines={1}>
                    {inv.description}
                  </Text>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {invData && invData.total_pages > 1 && (
        <View style={twStyle("flex-row items-center justify-center py-3")}>
          <TouchableOpacity
            disabled={page <= 1}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
            style={[twStyle(`rounded-lg px-4 py-2 ${page <= 1 ? "bg-gray-100" : "bg-gray-200"}`), { marginRight: 16 }]}
          >
            <Text style={twStyle(`text-sm font-medium ${page <= 1 ? "text-gray-400" : "text-gray-700"}`)}>Prev</Text>
          </TouchableOpacity>
          <Text style={[twStyle("text-sm text-gray-500"), { marginRight: 16 }]}>
            Page {page} of {invData.total_pages}
          </Text>
          <TouchableOpacity
            disabled={page >= invData.total_pages}
            onPress={() => setPage((p) => p + 1)}
            style={twStyle(`rounded-lg px-4 py-2 ${page >= invData.total_pages ? "bg-gray-100" : "bg-gray-200"}`)}
          >
            <Text style={twStyle(`text-sm font-medium ${page >= invData.total_pages ? "text-gray-400" : "text-gray-700"}`)}>Next</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Invoice detail */}
      <BottomSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={`Invoice ${selected?.invoice_number ?? ""}`}
      >
        {selected && (
          <View>
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <View>
                <Text style={twStyle("text-sm text-gray-500")}>Issued {formatDate(selected.issue_date)}</Text>
                <Text style={twStyle("text-xs text-gray-400")}>Due: {formatDate(selected.due_date)}</Text>
              </View>
              <View style={twStyle(`rounded-full px-3 py-1 ${statusColor(selected.status).bg}`)}>
                <Text style={twStyle(`text-xs font-medium capitalize ${statusColor(selected.status).text}`)}>
                  {selected.status}
                </Text>
              </View>
            </View>

            {selected.client_name && (
              <View style={twStyle("mb-3 rounded-xl bg-gray-50 p-3")}>
                <Text style={twStyle("text-xs text-gray-500")}>Client</Text>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>{selected.client_name}</Text>
                {selected.client_email && (
                  <Text style={twStyle("text-xs text-gray-400")}>{selected.client_email}</Text>
                )}
              </View>
            )}

            {selected.line_items.length > 0 && (
              <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden")}>
                {selected.line_items.map((li, i) => (
                  <View
                    key={li.id || i}
                    style={twStyle(`flex-row items-center justify-between px-4 py-3 ${
                      i < selected.line_items.length - 1 ? "border-b border-gray-200" : ""
                    }`)}
                  >
                    <View style={twStyle("flex-1")}>
                      <Text style={twStyle("text-sm text-gray-900")} numberOfLines={2}>{li.description}</Text>
                      <Text style={twStyle("text-xs text-gray-500")}>
                        {li.quantity} × {formatCurrency(li.unit_price)}
                      </Text>
                    </View>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                      {formatCurrency(li.total_price)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white p-4")}>
              <View style={twStyle("flex-row justify-between")}>
                <Text style={twStyle("text-sm text-gray-500")}>Subtotal</Text>
                <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(selected.subtotal)}</Text>
              </View>
              {selected.tax_amount > 0 && (
                <View style={twStyle("mt-1.5 flex-row justify-between")}>
                  <Text style={twStyle("text-sm text-gray-500")}>Tax ({selected.tax_rate}%)</Text>
                  <Text style={twStyle("text-sm text-gray-700")}>{formatCurrency(selected.tax_amount)}</Text>
                </View>
              )}
              <View style={twStyle("mt-2 border-t border-gray-100 pt-2 flex-row justify-between")}>
                <Text style={twStyle("text-base font-bold text-gray-900")}>Total</Text>
                <Text style={twStyle("text-base font-bold text-gray-900")}>
                  {formatCurrency(selected.total_amount)}
                </Text>
              </View>
            </View>

            {/* Actions */}
            <View style={twStyle("flex-row")}>
              {(selected.status === "pending" || selected.status === "overdue") && (
                <TouchableOpacity
                  style={[twStyle("flex-1 items-center rounded-lg bg-green-50 py-2.5"), { marginRight: 8 }]}
                  onPress={() => handleMarkPaid(selected)}
                  disabled={updatingStatus}
                >
                  <Text style={twStyle("text-sm font-medium text-green-700")}>
                    {updatingStatus ? "Updating..." : "Mark Paid"}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[twStyle("flex-1 items-center rounded-lg bg-indigo-50 py-2.5"), { marginRight: 8 }]}
                onPress={() => handleSendInvoice(selected)}
                disabled={sending}
              >
                <Text style={twStyle("text-sm font-medium text-indigo-700")}>
                  {sending ? "Sending..." : "Email Invoice"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[twStyle("flex-1 items-center rounded-lg bg-gray-100 py-2.5"), { marginRight: 8 }]}
                onPress={handleExport}
              >
                <Text style={twStyle("text-sm font-medium text-gray-700")}>Export</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}
