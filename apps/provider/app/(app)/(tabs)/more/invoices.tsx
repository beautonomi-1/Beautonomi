import { useState, useCallback, useMemo, type ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  Share,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Redirect, useRouter } from "expo-router";
import { useApi, useApiMutation } from "@/hooks/useApi";
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
  status: string;
  description: string | null;
  client_name?: string;
  client_email?: string;
  line_items: LineItem[];
  created_at: string;
}

type InvoiceFormLineItem = {
  description: string;
  quantity: string;
  unit_price: string;
};

type InvoiceForm = {
  invoice_type: "platform_fee" | "commission" | "subscription" | "transaction_fee" | "other";
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  status: string;
  description: string;
  notes: string;
  tax_rate: string;
  line_items: InvoiceFormLineItem[];
};

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
  { label: "Sent", value: "sent" },
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

function addDaysInput(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return formatLocalDate(next);
}

function isValidIsoDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

function createDefaultInvoiceForm(): InvoiceForm {
  const today = new Date();
  return {
    invoice_type: "other",
    period_start: formatLocalDate(today),
    period_end: formatLocalDate(today),
    issue_date: formatLocalDate(today),
    due_date: addDaysInput(today, 30),
    status: "draft",
    description: "",
    notes: "",
    tax_rate: "0",
    line_items: [{ description: "", quantity: "1", unit_price: "" }],
  };
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
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>(() => createDefaultInvoiceForm());
  const [formError, setFormError] = useState<string | null>(null);

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
  const { execute: updateInvoice, loading: updatingStatus } = useApiMutation("patch");
  const { execute: sendInvoice, loading: sending } = useApiMutation("post");
  const { execute: createInvoice, loading: creatingInvoice } = useApiMutation<Invoice>("post");
  const { execute: saveInvoice, loading: savingInvoice } = useApiMutation<Invoice>("patch");
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
    const outstanding = filtered.filter((i) =>
      i.status === "sent" || i.status === "partially_paid" || i.status === "overdue"
    );
    const paid = filtered.filter((i) => i.status === "paid");
    const overdue = filtered.filter((i) => i.status === "overdue");
    return {
      total: search.trim() ? filtered.length : invData?.total ?? filtered.length,
      outstandingAmount: outstanding.reduce((s, i) => s + i.total_amount, 0),
      paidAmount: paid.reduce((s, i) => s + i.total_amount, 0),
      overdueCount: overdue.length,
    };
  }, [filtered, invoices.length, invData, search]);

  function openCreateInvoice() {
    setEditingInvoice(null);
    setInvoiceForm(createDefaultInvoiceForm());
    setFormError(null);
    setShowEditor(true);
  }

  function openEditInvoice(inv: Invoice) {
    setEditingInvoice(inv);
    setInvoiceForm({
      invoice_type: (["platform_fee", "commission", "subscription", "transaction_fee", "other"].includes(inv.invoice_type) ? inv.invoice_type : "other") as InvoiceForm["invoice_type"],
      period_start: (inv as any).period_start || inv.issue_date,
      period_end: (inv as any).period_end || inv.issue_date,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      status: inv.status,
      description: inv.description ?? "",
      notes: (inv as any).notes ?? "",
      tax_rate: String(inv.tax_rate ?? 0),
      line_items: inv.line_items.length
        ? inv.line_items.map((item) => ({
            description: item.description,
            quantity: String(item.quantity ?? 1),
            unit_price: String(item.unit_price ?? 0),
          }))
        : [{ description: "", quantity: "1", unit_price: "" }],
    });
    setFormError(null);
    setSelected(null);
    setShowEditor(true);
  }

  async function handleSaveInvoiceForm() {
    const lineItems = invoiceForm.line_items
      .map((item) => ({
        line_item_type: "other",
        description: item.description.trim(),
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
      }))
      .filter((item) => item.description && item.quantity > 0);

    if (!lineItems.length) {
      setFormError("Add at least one line item with a description and quantity.");
      return;
    }

    if (!isValidIsoDate(invoiceForm.issue_date)) {
      setFormError("Issue date must be in YYYY-MM-DD format.");
      return;
    }
    if (!isValidIsoDate(invoiceForm.due_date)) {
      setFormError("Due date must be in YYYY-MM-DD format.");
      return;
    }
    if (!isValidIsoDate(invoiceForm.period_start)) {
      setFormError("Period start must be in YYYY-MM-DD format.");
      return;
    }
    if (!isValidIsoDate(invoiceForm.period_end)) {
      setFormError("Period end must be in YYYY-MM-DD format.");
      return;
    }

    const payload = {
      ...invoiceForm,
      tax_rate: Number(invoiceForm.tax_rate || 0),
      description: invoiceForm.description.trim() || null,
      notes: invoiceForm.notes.trim() || null,
      line_items: lineItems,
    };

    const { error } = editingInvoice
      ? await saveInvoice(`/api/provider/invoices/${editingInvoice.id}`, payload)
      : await createInvoice("/api/provider/invoices", payload);

    if (error) {
      setFormError(error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowEditor(false);
    setEditingInvoice(null);
    refresh();
  }

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

  function handleMarkAsSent(inv: Invoice) {
    Alert.alert(
      "Mark as sent?",
      `Mark invoice ${inv.invoice_number} as sent? This updates the status to "sent" but does not email the client.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark sent",
          onPress: async () => {
            const { error } = await sendInvoice(`/api/provider/invoices/${inv.id}/send`, {});
            if (error) {
              Alert.alert("Error", error);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setSelected(null);
              refresh();
            }
          },
        },
      ]
    );
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
    <InvoicesShell embedded={embedded} screenPadding={screenPadding}>
      {!embedded ? (
        <ScreenHeader
          title="Invoices"
          showBack
          subtitle={`${stats.total} invoices`}
          rightAction={
            <View style={twStyle("flex-row")}>
              <TouchableOpacity
                style={[twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100"), { marginRight: 8 }]}
                onPress={handleExportAll}
              >
                <Ionicons name="download-outline" size={18} color="#374151" />
              </TouchableOpacity>
              <TouchableOpacity
                style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-indigo-600")}
                onPress={openCreateInvoice}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
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
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-indigo-600")}
            onPress={openCreateInvoice}
          >
            <Ionicons name="add" size={20} color="#fff" />
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
        placeholder="Search by number or client..."
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
          description={search || filter !== "all" ? "No results for this filter" : "Platform invoices will appear here"}
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
            <View style={twStyle("flex-row flex-wrap")}>
              {(["sent", "partially_paid", "overdue"].includes(selected.status)) && (
                <TouchableOpacity
                  style={[twStyle("items-center rounded-lg bg-green-50 px-3 py-2.5"), { marginRight: 8, marginBottom: 8 }]}
                  onPress={() => handleMarkPaid(selected)}
                  disabled={updatingStatus}
                >
                  <Text style={twStyle("text-sm font-medium text-green-700")}>
                    {updatingStatus ? "Updating..." : "Mark Paid"}
                  </Text>
                </TouchableOpacity>
              )}
              {selected.status === "draft" && (
                <TouchableOpacity
                  style={[twStyle("items-center rounded-lg bg-indigo-50 px-3 py-2.5"), { marginRight: 8, marginBottom: 8 }]}
                  onPress={() => handleMarkAsSent(selected)}
                  disabled={sending}
                >
                  <Text style={twStyle("text-sm font-medium text-indigo-700")}>
                    {sending ? "Updating..." : "Mark as Sent"}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[twStyle("items-center rounded-lg bg-blue-50 px-3 py-2.5"), { marginRight: 8, marginBottom: 8 }]}
                onPress={() => openEditInvoice(selected)}
              >
                <Text style={twStyle("text-sm font-medium text-blue-700")}>Edit</Text>
              </TouchableOpacity>
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
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={showEditor}
        onClose={() => {
          setShowEditor(false);
          setEditingInvoice(null);
        }}
        title={editingInvoice ? "Edit invoice" : "Create invoice"}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Description</Text>
          <TextInput
            style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900")}
            value={invoiceForm.description}
            onChangeText={(description) => setInvoiceForm((current) => ({ ...current, description }))}
            placeholder="Invoice description"
          />
          <View style={twStyle("mb-3 flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
              <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Period start</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900")}
                value={invoiceForm.period_start}
                onChangeText={(period_start) => setInvoiceForm((current) => ({ ...current, period_start }))}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Period end</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900")}
                value={invoiceForm.period_end}
                onChangeText={(period_end) => setInvoiceForm((current) => ({ ...current, period_end }))}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          <View style={twStyle("mb-3 flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
              <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Issue date</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900")}
                value={invoiceForm.issue_date}
                onChangeText={(issue_date) => setInvoiceForm((current) => ({ ...current, issue_date }))}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Due date</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900")}
                value={invoiceForm.due_date}
                onChangeText={(due_date) => setInvoiceForm((current) => ({ ...current, due_date }))}
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          <View style={twStyle("mb-3 flex-row")}>
            <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
              <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Tax rate %</Text>
              <TextInput
                style={twStyle("rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900")}
                value={invoiceForm.tax_rate}
                onChangeText={(tax_rate) => setInvoiceForm((current) => ({ ...current, tax_rate: tax_rate.replace(/[^0-9.]/g, "") }))}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            </View>
            <View style={twStyle("flex-1")}>
              <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Status</Text>
              <View style={twStyle("flex-row flex-wrap")}>
                {["draft", "sent", "paid"].map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[twStyle(`mr-2 mb-2 rounded-full border px-3 py-2 ${invoiceForm.status === status ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"}`)]}
                    onPress={() => setInvoiceForm((current) => ({ ...current, status }))}
                  >
                    <Text style={twStyle(`text-xs capitalize ${invoiceForm.status === status ? "text-indigo-700" : "text-gray-600"}`)}>{status}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <Text style={twStyle("mb-2 text-sm font-semibold text-gray-900")}>Line items</Text>
          {invoiceForm.line_items.map((item, index) => (
            <View key={index} style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 p-3")}>
              <View style={twStyle("mb-2 flex-row items-center justify-between")}>
                <Text style={twStyle("text-xs font-medium text-gray-500")}>Item {index + 1}</Text>
                {invoiceForm.line_items.length > 1 && (
                  <TouchableOpacity
                    onPress={() =>
                      setInvoiceForm((current) => ({
                        ...current,
                        line_items: current.line_items.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={twStyle("mb-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900")}
                value={item.description}
                onChangeText={(description) =>
                  setInvoiceForm((current) => ({
                    ...current,
                    line_items: current.line_items.map((li, i) => (i === index ? { ...li, description } : li)),
                  }))
                }
                placeholder="Description"
              />
              <View style={twStyle("flex-row")}>
                <TextInput
                  style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900"), { marginRight: 8 }]}
                  value={item.quantity}
                  onChangeText={(quantity) =>
                    setInvoiceForm((current) => ({
                      ...current,
                      line_items: current.line_items.map((li, i) => (i === index ? { ...li, quantity: quantity.replace(/[^0-9.]/g, "") } : li)),
                    }))
                  }
                  keyboardType="decimal-pad"
                  placeholder="Qty"
                />
                <TextInput
                  style={twStyle("flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900")}
                  value={item.unit_price}
                  onChangeText={(unit_price) =>
                    setInvoiceForm((current) => ({
                      ...current,
                      line_items: current.line_items.map((li, i) => (i === index ? { ...li, unit_price: unit_price.replace(/[^0-9.]/g, "") } : li)),
                    }))
                  }
                  keyboardType="decimal-pad"
                  placeholder="Unit price"
                />
              </View>
            </View>
          ))}
          <TouchableOpacity
            style={twStyle("mb-3 items-center rounded-xl border border-dashed border-gray-300 bg-white py-3")}
            onPress={() =>
              setInvoiceForm((current) => ({
                ...current,
                line_items: [...current.line_items, { description: "", quantity: "1", unit_price: "" }],
              }))
            }
          >
            <Text style={twStyle("text-sm font-medium text-gray-700")}>Add line item</Text>
          </TouchableOpacity>

          <Text style={twStyle("mb-1 text-xs font-medium text-gray-500")}>Notes</Text>
          <TextInput
            style={twStyle("mb-3 min-h-[80px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900")}
            value={invoiceForm.notes}
            onChangeText={(notes) => setInvoiceForm((current) => ({ ...current, notes }))}
            placeholder="Optional notes"
            multiline
          />
          {formError && (
            <View style={twStyle("mb-3 rounded-xl bg-red-50 p-3")}>
              <Text style={twStyle("text-sm text-red-700")}>{formError}</Text>
            </View>
          )}
          <TouchableOpacity
            style={twStyle("items-center rounded-xl bg-indigo-600 py-3")}
            onPress={handleSaveInvoiceForm}
            disabled={creatingInvoice || savingInvoice}
          >
            {creatingInvoice || savingInvoice ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={twStyle("font-semibold text-white")}>{editingInvoice ? "Save invoice" : "Create invoice"}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
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
