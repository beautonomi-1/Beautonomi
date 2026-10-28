/**
 * Platform invoices, from Beautonomi to the provider.
 *
 * Read-only by design: the provider is the payer, not the issuer. Invoices are
 * raised by the monthly issuance job (or a superadmin), so this screen views,
 * downloads and pays them — it does not create or edit them. The matching write
 * endpoints are superadmin-only and would 403 here.
 */
import { useState, useCallback, useMemo, useEffect, type ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  getBillingPaystackReturnUrl,
  getBillingPaymentReturnDeepLink,
  matchesBillingPaystackReturnUrl,
} from "@/lib/payments/providerPaystackReturn";
import { Redirect, useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
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
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { downloadInvoiceExportCsv } from "@/lib/download-invoice-export";

interface LineItem {
  id: string;
  line_item_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface InvoicePayment {
  id: string;
  amount: number;
  status: string;
  payment_reference?: string | null;
  payment_date?: string | null;
  payment_method?: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type: string;
  issue_date: string;
  due_date: string;
  currency?: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  amount_paid?: number | null;
  amount_due?: number | null;
  status: string;
  effective_status?: string;
  description: string | null;
  client_name?: string;
  client_email?: string;
  line_items: LineItem[];
  payments?: InvoicePayment[];
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

const STATUS_FILTER_DEFS = [
  { labelKey: "filterAll", value: "all" },
  { labelKey: "filterUnpaid", value: "open" },
  { labelKey: "filterPaid", value: "paid" },
  { labelKey: "filterOverdue", value: "overdue" },
];

const PERIOD_FILTER_DEFS = [
  { labelKey: "periodAll", value: "all" },
  { labelKey: "periodMonth", value: "month" },
  { labelKey: "periodWeek", value: "week" },
];

function invoiceStatusLabel(
  status: string,
  overduePending: boolean,
  iv: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (overduePending) return iv("statusOverdue");
  if (status === "paid") return iv("statusPaid");
  if (status === "overdue") return iv("statusOverdue");
  if (status === "sent") return iv("statusSent");
  if (status === "partially_paid") return iv("statusPartiallyPaid");
  if (status === "pending") return iv("statusPending");
  if (status === "draft") return iv("statusDraft");
  return status.replace("_", " ");
}

function effectiveStatus(inv: Invoice): string {
  return inv.effective_status ?? inv.status;
}

function isPayableInvoice(inv: Invoice): boolean {
  const st = effectiveStatus(inv);
  return (st === "sent" || st === "partially_paid" || st === "overdue") && amountDue(inv) > 0;
}

function money(inv: Invoice, amount: number): string {
  return formatCurrency(amount, inv.currency ?? undefined);
}

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
  const { t } = useTranslation();
  const iv = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t("provider.mobile.screens.invoices." + key, opts) as string,
    [t],
  );
  const statusFilters = useMemo(
    () => STATUS_FILTER_DEFS.map((f) => ({ label: iv(f.labelKey), value: f.value })),
    [iv],
  );
  const periodFilters = useMemo(
    () => PERIOD_FILTER_DEFS.map((f) => ({ label: iv(f.labelKey), value: f.value })),
    [iv],
  );
  const router = useRouter();
  const { screenPadding } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [period, setPeriod] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [showEft, setShowEft] = useState(false);
  const [eftAmount, setEftAmount] = useState("");
  const [eftReference, setEftReference] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const { data: permissionData } = useApi<{ isOwner?: boolean; permissions?: Record<string, boolean> }>(
    "/api/provider/permissions",
    { staleTimeMs: 60_000 },
  );
  const canPay =
    permissionData?.isOwner === true || permissionData?.permissions?.edit_settings === true;

  const statusParam = filter !== "all" ? `&status=${filter}` : "";
  const periodRange = useMemo(() => getInvoicePeriodRange(period), [period]);
  const periodParams = [
    periodRange.from ? `date_from=${encodeURIComponent(periodRange.from)}` : "",
    periodRange.to ? `date_to=${encodeURIComponent(periodRange.to)}` : "",
  ].filter(Boolean).join("&");
  const periodParam = periodParams ? `&${periodParams}` : "";
  const qParam = debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : "";
  const { data: invData, loading, error: loadError, refresh } = useApi<InvoicesResponse>(
    `/api/provider/invoices?page=${page}&limit=25${statusParam}${periodParam}${qParam}`
  );
  const invoices = useMemo(() => invData?.invoices ?? [], [invData?.invoices]);
  const { execute: startPayment } = useApiMutation<{
    payment_url?: string;
    authorization_url?: string;
    amount?: number;
  }>("post");
  const { execute: submitEftClaim, loading: submittingEft } = useApiMutation<{ payment?: unknown }>("post");
  const { waitForCheckout } = useInAppPaystackCheckout();
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  useEffect(() => {
    if (!selected) {
      setShowEft(false);
      setEftAmount("");
      setEftReference("");
      return;
    }
    setEftAmount(String(amountDue(selected)));
  }, [selected?.id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const stats = useMemo(() => {
    const summary = invData?.summary;
    if (summary) {
      return {
        total: invData?.total ?? invoices.length,
        outstandingAmount: summary.outstanding_amount,
        paidAmount: summary.paid_amount,
        overdueCount: summary.overdue_count,
      };
    }
    return {
      total: invData?.total ?? invoices.length,
      outstandingAmount: 0,
      paidAmount: 0,
      overdueCount: 0,
    };
  }, [invData, invoices.length]);

  const exportQueryString = useMemo(() => {
    const p = new URLSearchParams();
    if (filter !== "all") p.set("status", filter);
    if (periodRange.from) p.set("date_from", periodRange.from);
    if (periodRange.to) p.set("date_to", periodRange.to);
    if (debouncedSearch) p.set("q", debouncedSearch);
    return p.toString();
  }, [filter, periodRange, debouncedSearch]);

  async function handleDownloadInvoice(inv: Invoice) {
    setDownloadingInvoice(true);
    try {
      await downloadPdf({
        router,
        pdfPath: `/api/provider/invoices/${inv.id}/download`,
        signedUrlPath: `/api/provider/invoices/${inv.id}/signed-url`,
        filename: `invoice_${inv.invoice_number || inv.id}.pdf`,
        title: iv("invoiceTitle", { number: inv.invoice_number }),
        label: iv("downloadLabel"),
      });
    } catch (e) {
      Alert.alert(iv("downloadUnavailable"), e instanceof Error ? e.message : iv("downloadFailed"));
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
      Alert.alert(iv("alreadySettledTitle"), iv("alreadySettledBody"));
      return;
    }

    setPayingInvoiceId(inv.id);
    try {
      const returnUrl = getBillingPaymentReturnDeepLink();
      const { data, error } = await startPayment(
        `/api/provider/invoices/${inv.id}/initialize-payment`,
        {
          in_app: true,
          callback_url: getBillingPaystackReturnUrl({ inApp: true }),
        },
      );

      if (error || !data) {
        Alert.alert(iv("paymentUnavailable"), error || iv("paymentStartFailed"));
        return;
      }

      const url = data.authorization_url ?? data.payment_url;
      if (!url) {
        Alert.alert(iv("paymentUnavailable"), iv("noCheckoutLink"));
        return;
      }

      const result = await waitForCheckout(url, {
        matchSuccess: (u) => matchesBillingPaystackReturnUrl(u, { success: true }),
        matchCancel: (u) => matchesBillingPaystackReturnUrl(u, { cancelled: true }),
        title: iv("invoiceTitle", { number: inv.invoice_number }),
        returnUrl,
      });

      if (result.outcome === "start_failed") {
        Alert.alert(iv("paymentUnavailable"), iv("paymentStartFailed"));
        return;
      }

      if (result.outcome === "success") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          iv("paymentReceivedTitle"),
          iv("paymentReceivedBody"),
        );
        setSelected(null);
      } else if (result.outcome === "cancel") {
        Alert.alert(iv("paymentCancelledTitle"), iv("paymentCancelledBody"));
      }
      await refresh();
    } finally {
      setPayingInvoiceId(null);
    }
  }

  async function handleExportCsv() {
    setExportingCsv(true);
    try {
      await downloadInvoiceExportCsv(exportQueryString);
    } catch (e) {
      Alert.alert(iv("exportFailedTitle"), e instanceof Error ? e.message : iv("exportFailedBody"));
    } finally {
      setExportingCsv(false);
    }
  }

  async function handleSubmitEft(inv: Invoice) {
    const amount = parseFloat(eftAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert(iv("invalidAmountTitle"), iv("invalidAmountBody"));
      return;
    }
    const { error } = await submitEftClaim(`/api/provider/invoices/${inv.id}/pay`, {
      amount,
      paymentReference: eftReference.trim() || undefined,
    });
    if (error) {
      Alert.alert(iv("eftFailedTitle"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(iv("eftSubmittedTitle"), iv("eftSubmittedBody"));
    setShowEft(false);
    setSelected(null);
    await refresh();
  }

  const selectedDue = selected ? amountDue(selected) : 0;
  const selectedIsPayable = Boolean(selected && isPayableInvoice(selected));
  const selectedHasPendingEft = Boolean(
    selected?.payments?.some((p) => p.status === "pending"),
  );
  const isPayingSelected = Boolean(selected && payingInvoiceId === selected.id);

  return (
    <InvoicesShell embedded={embedded} screenPadding={screenPadding}>
      {!embedded ? (
        <ScreenHeader
          title={iv("title")}
          showBack
          subtitle={iv("subtitle", { count: stats.total })}
          rightAction={
            <TouchableOpacity
              style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
              onPress={() => void handleExportCsv()}
              disabled={exportingCsv}
            >
              {exportingCsv ? (
                <ActivityIndicator size="small" color="#374151" />
              ) : (
                <Ionicons name="download-outline" size={18} color="#374151" />
              )}
            </TouchableOpacity>
          }
        />
      ) : (
        <View style={twStyle("mb-2 flex-row items-center justify-end gap-2 px-4")}>
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-gray-100")}
            onPress={() => void handleExportCsv()}
            disabled={exportingCsv}
          >
            <Ionicons name="download-outline" size={18} color="#374151" />
          </TouchableOpacity>
        </View>
      )}

      <View style={twStyle("mb-3 flex-row")}>
        <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
          <StatCard title={iv("statPaid")} value={formatCurrency(stats.paidAmount)} icon="checkmark-circle-outline" iconColor="#22c55e" iconBg="bg-green-50" compact />
        </View>
        <View style={[twStyle("flex-1"), { marginEnd: 8 }]}>
          <StatCard title={iv("statOutstanding")} value={formatCurrency(stats.outstandingAmount)} icon="alert-circle-outline" iconColor="#f59e0b" iconBg="bg-amber-50" compact />
        </View>
        <View style={twStyle("flex-1")}>
          <StatCard title={iv("statOverdue")} value={String(stats.overdueCount)} icon="warning-outline" iconColor="#ef4444" iconBg="bg-red-50" compact />
        </View>
      </View>

      <SearchBar
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setPage(1);
        }}
        placeholder={iv("searchPlaceholder")}
      />

      <View style={twStyle("my-2")}>
        <FilterChipGroup
          options={statusFilters}
          selected={filter}
          onSelect={(v) => { setFilter(v); setPage(1); }}
        />
      </View>
      <View style={twStyle("mb-3")}>
        <FilterChipGroup options={periodFilters} selected={period} onSelect={(v) => { setPeriod(v); setPage(1); }} />
      </View>

      {loadError && !invData ? (
        <ErrorState message={loadError} onRetry={refresh} />
      ) : loading && !invData && !loadError ? (
        <SkeletonList rows={5} />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title={iv("emptyTitle")}
          description={search || filter !== "all" ? iv("emptyFiltered") : iv("emptyDesc")}
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
          style={{ flex: 1 }}
          data={invoices}
          keyExtractor={(i: Invoice) => i.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: inv }: { item: Invoice }) => {
            const st = effectiveStatus(inv);
            const sc = statusColor(st);
            const due = amountDue(inv);
            const showDue = isPayableInvoice(inv);
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
                  <View style={twStyle("ms-3 flex-1")}>
                    <View style={twStyle("flex-row items-center justify-between")}>
                      <Text style={twStyle("text-sm font-semibold text-gray-900")}>{inv.invoice_number}</Text>
                      <Text style={twStyle("text-base font-bold text-gray-900")}>
                        {showDue ? money(inv, due) : money(inv, inv.total_amount)}
                      </Text>
                    </View>
                    <View style={twStyle("flex-row items-center justify-between mt-0.5")}>
                      <View style={twStyle("flex-row items-center")}>
                        <Text style={[twStyle("text-xs text-gray-500"), { marginEnd: 8 }]}>{formatDate(inv.issue_date)}</Text>
                        {showDue ? (
                          <Text style={twStyle("text-xs text-amber-700")}>{iv("amountDueLabel")}</Text>
                        ) : null}
                      </View>
                      <View style={twStyle(`rounded-full px-2 py-0.5 ${sc.bg}`)}>
                        <Text style={twStyle(`text-[10px] font-medium capitalize ${sc.text}`)}>
                          {invoiceStatusLabel(st, false, iv)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                {inv.description && (
                  <Text style={twStyle("mt-1.5 ms-[52px] text-xs text-gray-400")} numberOfLines={1}>
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
            style={[twStyle(`rounded-lg px-4 py-2 ${page <= 1 ? "bg-gray-100" : "bg-gray-200"}`), { marginEnd: 16 }]}
          >
            <Text style={twStyle(`text-sm font-medium ${page <= 1 ? "text-gray-400" : "text-gray-700"}`)}>{iv("prev")}</Text>
          </TouchableOpacity>
          <Text style={[twStyle("text-sm text-gray-500"), { marginEnd: 16 }]}>
            {iv("pageOf", { page, total: invData.total_pages })}
          </Text>
          <TouchableOpacity
            disabled={page >= invData.total_pages}
            onPress={() => setPage((p) => p + 1)}
            style={twStyle(`rounded-lg px-4 py-2 ${page >= invData.total_pages ? "bg-gray-100" : "bg-gray-200"}`)}
          >
            <Text style={twStyle(`text-sm font-medium ${page >= invData.total_pages ? "text-gray-400" : "text-gray-700"}`)}>{iv("next")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Invoice detail */}
      <BottomSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={iv("invoiceTitle", { number: selected?.invoice_number ?? "" })}
      >
        {selected && (
          <View>
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <View>
                <Text style={twStyle("text-sm text-gray-500")}>{iv("issued", { date: formatDate(selected.issue_date) })}</Text>
                <Text style={twStyle("text-xs text-gray-400")}>{iv("due", { date: formatDate(selected.due_date) })}</Text>
              </View>
              <View style={twStyle(`rounded-full px-3 py-1 ${statusColor(effectiveStatus(selected)).bg}`)}>
                <Text style={twStyle(`text-xs font-medium capitalize ${statusColor(effectiveStatus(selected)).text}`)}>
                  {invoiceStatusLabel(effectiveStatus(selected), false, iv)}
                </Text>
              </View>
            </View>

            {selected.payments && selected.payments.length > 0 && (
              <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white overflow-hidden")}>
                <Text style={twStyle("px-4 py-2 text-xs font-semibold uppercase text-gray-500")}>
                  {iv("paymentHistory")}
                </Text>
                {selected.payments.map((p, i) => (
                  <View
                    key={p.id}
                    style={twStyle(`flex-row items-center justify-between px-4 py-2.5 ${
                      i < selected.payments!.length - 1 ? "border-b border-gray-100" : ""
                    }`)}
                  >
                    <View style={twStyle("flex-1 pe-2")}>
                      <Text style={twStyle("text-sm text-gray-900")}>{money(selected, Number(p.amount))}</Text>
                      <Text style={twStyle("text-xs text-gray-500")} numberOfLines={1}>
                        {p.payment_reference || p.payment_method || iv("paymentNoRef")}
                      </Text>
                    </View>
                    <Text style={twStyle("text-xs font-medium capitalize text-gray-600")}>{p.status}</Text>
                  </View>
                ))}
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
                        {iv("lineQtyPrice", { quantity: li.quantity, price: money(selected, li.unit_price) })}
                      </Text>
                    </View>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                      {money(selected, li.total_price)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white p-4")}>
              <View style={twStyle("flex-row justify-between")}>
                <Text style={twStyle("text-sm text-gray-500")}>{iv("subtotal")}</Text>
                <Text style={twStyle("text-sm text-gray-700")}>{money(selected, selected.subtotal)}</Text>
              </View>
              {selected.tax_amount > 0 && (
                <View style={twStyle("mt-1.5 flex-row justify-between")}>
                  <Text style={twStyle("text-sm text-gray-500")}>{iv("tax", { rate: selected.tax_rate })}</Text>
                  <Text style={twStyle("text-sm text-gray-700")}>{money(selected, selected.tax_amount)}</Text>
                </View>
              )}
              <View style={twStyle("mt-2 border-t border-gray-100 pt-2 flex-row justify-between")}>
                <Text style={twStyle("text-base font-bold text-gray-900")}>{iv("total")}</Text>
                <Text style={twStyle("text-base font-bold text-gray-900")}>
                  {money(selected, selected.total_amount)}
                </Text>
              </View>
              {selectedDue > 0 && (
                <View style={twStyle("mt-1.5 flex-row justify-between")}>
                  <Text style={twStyle("text-sm text-gray-500")}>{iv("stillDue")}</Text>
                  <Text style={twStyle("text-sm font-semibold text-amber-700")}>
                    {money(selected, selectedDue)}
                  </Text>
                </View>
              )}
            </View>

            {/* Actions */}
            <View style={twStyle("flex-row flex-wrap")}>
              {selectedIsPayable && canPay && (
                <TouchableOpacity
                  style={[twStyle("min-w-[120px] items-center rounded-lg bg-indigo-600 px-4 py-2.5"), { marginEnd: 8, marginBottom: 8 }]}
                  onPress={() => handlePayInvoice(selected)}
                  disabled={isPayingSelected}
                >
                  {isPayingSelected ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={twStyle("text-sm font-semibold text-white")}>
                      {iv("payAmount", { amount: money(selected, selectedDue) })}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              {selectedIsPayable && canPay && !selectedHasPendingEft && (
                <TouchableOpacity
                  style={[twStyle("items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5"), { marginEnd: 8, marginBottom: 8 }]}
                  onPress={() => setShowEft((v) => !v)}
                >
                  <Text style={twStyle("text-sm font-medium text-indigo-800")}>{iv("submitEft")}</Text>
                </TouchableOpacity>
              )}
              {selectedIsPayable && !canPay && (
                <Text style={twStyle("mb-2 text-xs text-gray-500")}>{iv("ownerPaysOnly")}</Text>
              )}
              {selectedHasPendingEft && (
                <Text style={twStyle("mb-2 text-xs text-amber-700")}>{iv("eftPendingNote")}</Text>
              )}
              {showEft && canPay && selected && (
                <View style={twStyle("mb-3 w-full rounded-xl border border-gray-200 bg-gray-50 p-3")}>
                  <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>{iv("eftAmountLabel")}</Text>
                  <TextInput
                    style={twStyle("mb-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900")}
                    value={eftAmount}
                    onChangeText={setEftAmount}
                    keyboardType="decimal-pad"
                    placeholder={iv("eftAmountPlaceholder")}
                  />
                  <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>{iv("eftReferenceLabel")}</Text>
                  <TextInput
                    style={twStyle("mb-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900")}
                    value={eftReference}
                    onChangeText={setEftReference}
                    placeholder={iv("eftReferencePlaceholder")}
                  />
                  <TouchableOpacity
                    style={twStyle("items-center rounded-lg bg-indigo-600 py-2.5")}
                    onPress={() => void handleSubmitEft(selected)}
                    disabled={submittingEft}
                  >
                    {submittingEft ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={twStyle("text-sm font-semibold text-white")}>{iv("confirmEft")}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                style={[twStyle("items-center rounded-lg bg-gray-100 px-3 py-2.5"), { marginEnd: 8, marginBottom: 8 }]}
                onPress={() => handleDownloadInvoice(selected)}
                disabled={downloadingInvoice}
              >
                {downloadingInvoice ? (
                  <ActivityIndicator size="small" color="#374151" />
                ) : (
                  <Text style={twStyle("text-sm font-medium text-gray-700")}>{iv("download")}</Text>
                )}
              </TouchableOpacity>
            </View>

            {selected.status === "draft" && (
              <Text style={twStyle("mt-1 text-xs text-gray-400")}>
                {iv("draftNote")}
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
