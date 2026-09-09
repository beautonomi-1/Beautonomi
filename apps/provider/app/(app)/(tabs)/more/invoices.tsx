/**
 * Platform invoices, from Beautonomi to the provider.
 *
 * Read-only by design: the provider is the payer, not the issuer. Invoices are
 * raised by the monthly issuance job (or a superadmin), so this screen views,
 * downloads and pays them — it does not create or edit them. The matching write
 * endpoints are superadmin-only and would 403 here.
 */
import { useState, useCallback, useMemo, type ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  Share,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ExpoLinking from "expo-linking";
import { Redirect, useRouter } from "expo-router";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useInAppPaystackCheckout } from "@/hooks/useInAppPaystackCheckout";
import { downloadPdf } from "@/lib/pdf-file";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { useResponsive } from "@/hooks/useResponsive";

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
  amount_paid?: number | null;
  amount_due?: number | null;
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
  summary?: {
    paid_amount: number;
    outstanding_amount: number;
    overdue_count: number;
  };
}

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Unpaid", value: "sent" },
  { label: "Paid", value: "paid" },
  { label: "Overdue", value: "overdue" },
];

const PERIOD_FILTERS = [
  { label: "All Time", value: "all" },
  { label: "This Month", value: "month" },
  { label: "This Week", value: "week" },
];

/** Statuses that still owe money. `draft` is excluded: it has not been issued. */
const PAYABLE_STATUSES = ["sent", "partially_paid", "overdue"];

function statusColor(status: string) {
  if (status === "paid") return { bg: "bg-green-50", text: "text-green-700", icon: "checkmark-circle" as const, color: "#22c55e" };
  if (status === "overdue") return { bg: "bg-red-50", text: "text-red-700", icon: "alert-circle" as const, color: "#ef4444" };
  if (status === "sent" || status === "partially_paid") return { bg: "bg-blue-50", text: "text-blue-700", icon: "mail-outline" as const, color: "#3b82f6" };
  if (status === "pending") return { bg: "bg-amber-50", text: "text-amber-700", icon: "hourglass" as const, color: "#f59e0b" };
  if (status === "draft") return { bg: "bg-gray-100", text: "text-gray-500", icon: "document-outline" as const, color: "#6b7280" };
  return { bg: "bg-gray-100", text: "text-gray-500", icon: "ellipse" as const, color: "#6b7280" };
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getInvoicePeriodRange(period: string): { from?: string; to?: string } {
  if (period === "all") return {};
  const now = new Date();
  const end = formatLocalDate(now);
  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return { from: formatLocalDate(start), to: end };
  }
  if (period === "month") {
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: end };
  }
  return {};
}

/** Outstanding balance, tolerating older rows where `amount_due` is absent. */
function amountDue(inv: Invoice): number {
  const stored = Number(inv.amount_due ?? NaN);
  if (Number.isFinite(stored)) return stored;
  return Number(inv.total_amount ?? 0) - Number(inv.amount_paid ?? 0);
}

export function InvoicesContent({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  const statusParam = filter !== "all" ? `&status=${filter}` : "";
  const periodRange = useMemo(() => getInvoicePeriodRange(period), [period]);
  const periodParams = [
    periodRange.from ? `date_from=${encodeURIComponent(periodRange.from)}` : "",
    periodRange.to ? `date_to=${encodeURIComponent(periodRange.to)}` : "",
  ].filter(Boolean).join("&");
  const periodParam = periodParams ? `&${periodParams}` : "";
  const { data: invData, loading, error: loadError, refresh } = useApi<InvoicesResponse>(
    `/api/provider/invoices?page=${page}&limit=25${statusParam}${periodParam}`
  );
  const invoices = useMemo(() => invData?.invoices ?? [], [invData?.invoices]);
  const { execute: startPayment } = useApiMutation<{
    payment_url?: string;
    authorization_url?: string;
    amount?: number;
  }>("post");
  const { waitForCheckout } = useInAppPaystackCheckout();
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const filtered = useMemo(() => {
    let result = invoices;

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
  }, [invoices, search]);

  const stats = useMemo(() => {
    const summary = invData?.summary;
    if (summary && !search.trim()) {
      return {
        total: invData?.total ?? invoices.length,
        outstandingAmount: summary.outstanding_amount,
        paidAmount: summary.paid_amount,
        overdueCount: summary.overdue_count,
      };
    }
    const outstanding = filtered.filter((i) => PAYABLE_STATUSES.includes(i.status));
    const paid = filtered.filter((i) => i.status === "paid");
    const overdue = filtered.filter((i) => i.status === "overdue");
    return {
      total: search.trim() ? filtered.length : invData?.total ?? filtered.length,
      outstandingAmount: outstanding.reduce((s, i) => s + amountDue(i), 0),
      paidAmount: paid.reduce((s, i) => s + i.total_amount, 0),
      overdueCount: overdue.length,
    };
  }, [filtered, invoices.length, invData, search]);

  async function handleDownloadInvoice(inv: Invoice) {
    setDownloadingInvoice(true);
    try {
      await downloadPdf({
        router,
        pdfPath: `/api/provider/invoices/${inv.id}/download`,
        signedUrlPath: `/api/provider/invoices/${inv.id}/signed-url`,
        filename: `invoice_${inv.invoice_number || inv.id}.pdf`,
        title: `Invoice ${inv.invoice_number}`,
        label: "invoice",
      });
    } catch (e) {
      Alert.alert("Download unavailable", e instanceof Error ? e.message : "Could not download this invoice.");
    } finally {
      setDownloadingInvoice(false);
    }
  }

  /**
   * Paystack hosted checkout. The invoice is credited by the `charge.success`
   * webhook, not by this call returning — so on a successful close we refresh
   * and tell the provider settlement may lag rather than claiming it is paid.
   */
  async function handlePayInvoice(inv: Invoice) {
    const due = amountDue(inv);
    if (due <= 0) {
      Alert.alert("Already settled", "There is nothing outstanding on this invoice.");
      return;
    }

    setPayingInvoiceId(inv.id);
    try {
      const returnUrl = ExpoLinking.createURL("paystack-callback");
      const { data, error } = await startPayment(
        `/api/provider/invoices/${inv.id}/initialize-payment`,
        { in_app: true },
      );

      if (error || !data) {
        Alert.alert("Payment unavailable", error || "Could not start the payment. Please try again.");
        return;
      }

      const url = data.authorization_url ?? data.payment_url;
      if (!url) {
        Alert.alert("Payment unavailable", "No checkout link was returned. Please try again shortly.");
        return;
      }

      const result = await waitForCheckout(url, {
        matchSuccess: (u) => u.includes("payment_success=true"),
        matchCancel: (u) => u.includes("payment_cancelled=1"),
        title: `Invoice ${inv.invoice_number}`,
        returnUrl,
      });

      if (result.outcome === "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Payment received",
          "Thanks. It can take a moment for the invoice to show as paid.",
        );
        setSelected(null);
      } else if (result.outcome === "cancel") {
        Alert.alert("Payment cancelled", "The invoice has not been charged.");
      }
      await refresh();
    } finally {
      setPayingInvoiceId(null);
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

  const selectedDue = selected ? amountDue(selected) : 0;
  const selectedIsPayable = Boolean(
    selected && PAYABLE_STATUSES.includes(selected.status) && selectedDue > 0
  );
  const isPayingSelected = Boolean(selected && payingInvoiceId === selected.id);

  return (
    <InvoicesShell embedded={embedded} screenPadding={screenPadding}>
      {!embedded ? (
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
      ) : (
        <View style={twStyle("mb-2 flex-row items-center justify-end gap-2 px-4")}>
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
            onPress={handleExportAll}
          >
            <Ionicons name="download-outline" size={18} color="#374151" />
          </TouchableOpacity>
        </View>
      )}

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

      <SearchBar
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder="Search by number or amount..."
      />

      <View style={twStyle("my-2")}>
        <FilterChipGroup
          options={STATUS_FILTERS}
          selected={filter}
          onSelect={(v) => { setFilter(v); setPage(1); }}
        />
      </View>
      <View style={twStyle("mb-3")}>
        <FilterChipGroup options={PERIOD_FILTERS} selected={period} onSelect={(v) => { setPeriod(v); setPage(1); }} />
      </View>

      {loadError && !invData ? (
        <ErrorState message={loadError} onRetry={refresh} />
      ) : loading && !invData && !loadError ? (
        <SkeletonList rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No invoices"
          description={search || filter !== "all" ? "No results for this filter" : "Invoices from Beautonomi will appear here"}
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={(i: Invoice) => i.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
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
                          {isOverdue && inv.status === "pending" ? "Overdue" : inv.status.replace("_", " ")}
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
                  {selected.status.replace("_", " ")}
                </Text>
              </View>
            </View>

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
              {selectedDue > 0 && selectedDue !== selected.total_amount && (
                <View style={twStyle("mt-1.5 flex-row justify-between")}>
                  <Text style={twStyle("text-sm text-gray-500")}>Still due</Text>
                  <Text style={twStyle("text-sm font-semibold text-amber-700")}>
                    {formatCurrency(selectedDue)}
                  </Text>
                </View>
              )}
            </View>

            {/* Actions */}
            <View style={twStyle("flex-row flex-wrap")}>
              {selectedIsPayable && (
                <TouchableOpacity
                  style={[twStyle("min-w-[120px] items-center rounded-lg bg-indigo-600 px-4 py-2.5"), { marginRight: 8, marginBottom: 8 }]}
                  onPress={() => handlePayInvoice(selected)}
                  disabled={isPayingSelected}
                >
                  {isPayingSelected ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={twStyle("text-sm font-semibold text-white")}>
                      Pay {formatCurrency(selectedDue)}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[twStyle("items-center rounded-lg bg-gray-100 px-3 py-2.5"), { marginRight: 8, marginBottom: 8 }]}
                onPress={() => handleDownloadInvoice(selected)}
                disabled={downloadingInvoice}
              >
                {downloadingInvoice ? (
                  <ActivityIndicator size="small" color="#374151" />
                ) : (
                  <Text style={twStyle("text-sm font-medium text-gray-700")}>Download</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[twStyle("items-center rounded-lg bg-gray-100 px-3 py-2.5"), { marginBottom: 8 }]}
                onPress={handleExport}
              >
                <Text style={twStyle("text-sm font-medium text-gray-700")}>Share summary</Text>
              </TouchableOpacity>
            </View>

            {selected.status === "draft" && (
              <Text style={twStyle("mt-1 text-xs text-gray-400")}>
                This invoice has not been issued yet, so there is nothing to pay.
              </Text>
            )}
          </View>
        )}
      </BottomSheet>
    </InvoicesShell>
  );
}

function InvoicesShell({
  embedded,
  screenPadding,
  children,
}: {
  embedded: boolean;
  screenPadding: number;
  children: ReactNode;
}) {
  if (embedded) {
    return (
      <View
        style={{
          flex: 1,
          minHeight: 0,
          paddingHorizontal: screenPadding,
          backgroundColor: "#ffffff",
        }}
      >
        {children}
      </View>
    );
  }
  return <ScreenContainer scrollable={false}>{children}</ScreenContainer>;
}

export default function InvoicesScreen() {
  return <Redirect href="/(app)/(tabs)/more/billing?tab=invoices" />;
}
