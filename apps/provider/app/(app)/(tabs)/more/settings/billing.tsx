import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { downloadPdf, sharePdfFlow } from "@/lib/pdf-file";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FilterChipGroup } from "@/components/ui/FilterChip";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import { E164PhoneField } from "@/components/E164PhoneField";
import { validateE164Phone } from "@/lib/phone-country-codes";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  last4?: string;
  expiry_month?: number;
  expiry_year?: number;
  /** Pre-formatted `MM/YY` from the server. Preferred over recomputing. */
  expiry_label?: string;
  /** True when today is past the end of the expiry month. */
  is_expired?: boolean;
  is_default: boolean;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  invoice_type?: string;
  total_amount: number;
  currency: string;
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
}

interface BillingData {
  billingAddress: string | Record<string, unknown> | null;
  billingEmail: string | null;
  billingPhone: string | null;
  paymentMethods: PaymentMethod[];
  invoices: Invoice[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function invoiceStatusStyle(status: string): { bg: string; text: string } {
  switch (status) {
    case "paid":
      return { bg: "bg-green-50", text: "text-green-700" };
    case "sent":
      return { bg: "bg-blue-50", text: "text-blue-700" };
    case "overdue":
      return { bg: "bg-red-50", text: "text-red-700" };
    case "draft":
      return { bg: "bg-gray-100", text: "text-gray-600" };
    case "cancelled":
      return { bg: "bg-gray-100", text: "text-gray-400" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-600" };
  }
}

function formatBillingAddress(value: BillingData["billingAddress"]): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const line1 = typeof value.address_line1 === "string" ? value.address_line1 : "";
  const city = typeof value.city === "string" ? value.city : "";
  const country = typeof value.country === "string" ? value.country : "";
  return [line1, city, country].filter(Boolean).join(", ");
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function BillingScreen() {
  useResponsive();
  const router = useRouter();
  const {
    data: billing,
    loading,
    error,
    refresh,
  } = useApi<BillingData>("/api/provider/settings/billing");
  const { execute: updateBilling, loading: saving } = useApiMutation("patch");

  const { execute: postAction, loading: paying } = useApiMutation("post");
  const { execute: patchInvoice } = useApiMutation("patch");
  const { execute: patchPaymentMethod } = useApiMutation("patch");
  const { execute: deletePaymentMethod } = useApiMutation("delete");

  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState("all");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [busyPaymentMethodId, setBusyPaymentMethodId] = useState<string | null>(null);
  const [form, setForm] = useState({
    billingAddress: "",
    billingEmail: "",
    billingPhone: "",
  });

  useEffect(() => {
    if (billing) {
      setForm({
        billingAddress: formatBillingAddress(billing.billingAddress),
        billingEmail: billing.billingEmail ?? "",
        billingPhone: billing.billingPhone ?? "",
      });
    }
  }, [billing]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleDownloadInvoice = useCallback(async (inv: Invoice) => {
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
      const msg = e instanceof Error ? e.message : "Download failed";
      Alert.alert("Download failed", msg);
    }
  }, [router]);

  const handleShareInvoice = useCallback(async (inv: Invoice) => {
    try {
      await sharePdfFlow({
        pdfPath: `/api/provider/invoices/${inv.id}/download`,
        signedUrlPath: `/api/provider/invoices/${inv.id}/signed-url`,
        filename: `invoice_${inv.invoice_number || inv.id}.pdf`,
        title: `Invoice ${inv.invoice_number} - ${formatCurrency(inv.total_amount)}`,
        label: "invoice",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Share failed";
      Alert.alert("Share failed", msg);
    }
  }, []);

  const handleSetDefaultPaymentMethod = useCallback(
    async (pm: PaymentMethod) => {
      setBusyPaymentMethodId(pm.id);
      const { error: err } = await patchPaymentMethod(
        `/api/provider/payment-methods/${pm.id}`,
        { is_default: true },
      );
      setBusyPaymentMethodId(null);
      if (err) {
        Alert.alert("Error", err);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refresh();
      }
    },
    [patchPaymentMethod, refresh],
  );

  const handleRemovePaymentMethod = useCallback(
    async (pm: PaymentMethod) => {
      const label = pm.last4 ? `${pm.name} ending in ${pm.last4}` : pm.name;
      Alert.alert(
        "Remove payment method?",
        `${label} will be removed from your billing settings. Pending invoices that referenced it stay unchanged.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              setBusyPaymentMethodId(pm.id);
              const { error: err } = await deletePaymentMethod(
                `/api/provider/payment-methods/${pm.id}`,
              );
              setBusyPaymentMethodId(null);
              if (err) {
                Alert.alert("Error", err);
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                refresh();
              }
            },
          },
        ],
      );
    },
    [deletePaymentMethod, refresh],
  );

  async function handleSave() {
    if (form.billingPhone.trim()) {
      const pe = validateE164Phone(form.billingPhone);
      if (pe) {
        Alert.alert("Invalid phone", pe);
        return;
      }
    }
    const { error: err } = await updateBilling("/api/provider/settings/billing", {
      billingAddress: form.billingAddress.trim() || null,
      billingEmail: form.billingEmail.trim() || null,
      billingPhone: form.billingPhone.trim() || null,
    });
    if (err) {
      Alert.alert("Error", err);
    } else {
      setEditing(false);
      refresh();
    }
  }

  if (loading && !billing) return <LoadingState />;
  if (error && !billing) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Billing" showBack />
        <ErrorState message={error} onRetry={refresh} />
      </ScreenContainer>
    );
  }

  const invoices = billing?.invoices ?? [];
  const paymentMethods = billing?.paymentMethods ?? [];

  return (
    <ScreenContainer refreshing={refreshing} onRefresh={handleRefresh}>
      <ScreenHeader title="Billing" showBack subtitle="Invoices & payment info" />

      {/* ─── Billing Details ─── */}
      <SectionHeader
        title="Billing Information"
        actionLabel={editing ? "Cancel" : "Edit"}
        onAction={() => setEditing(!editing)}
      />
      <View style={twStyle("rounded-2xl border border-gray-100 bg-white p-4")}>
        {editing ? (
          <>
            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Billing Address</Text>
              <TextInput
                style={twStyle(
                  "rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                )}
                value={form.billingAddress}
                onChangeText={(t) => setForm((p) => ({ ...p, billingAddress: t }))}
                placeholder="Street, City, Code"
                placeholderTextColor="#9ca3af"
                multiline
                accessibilityLabel="Billing address"
              />
            </View>
            <View style={twStyle("mb-3")}>
              <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Billing Email</Text>
              <TextInput
                style={twStyle(
                  "rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                )}
                value={form.billingEmail}
                onChangeText={(t) => setForm((p) => ({ ...p, billingEmail: t }))}
                placeholder="billing@example.com"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                accessibilityLabel="Billing email"
              />
            </View>
            <E164PhoneField
              label="Billing Phone"
              valueE164={form.billingPhone}
              onChangeE164={(e164) => setForm((p) => ({ ...p, billingPhone: e164 }))}
              muted
              showHint={false}
              accessibilityLabel="Billing phone"
            />
            <ActionButton label="Save" onPress={handleSave} loading={saving} fullWidth />
          </>
        ) : (
          <>
            <Row
              icon="location-outline"
              label="Address"
              value={formatBillingAddress(billing?.billingAddress ?? null) || "Not set"}
            />
            <Row icon="mail-outline" label="Email" value={billing?.billingEmail ?? "Not set"} />
            <Row icon="call-outline" label="Phone" value={billing?.billingPhone ?? "Not set"} />
          </>
        )}
      </View>

      {/* ─── Payment Methods ─── */}
      <SectionHeader title="Payment Methods" />
      {paymentMethods.length === 0 ? (
        <View style={twStyle("items-center rounded-2xl border border-gray-100 bg-white px-4 py-8")}>
          <Ionicons name="card-outline" size={24} color="#d1d5db" />
          <Text style={twStyle("mt-2 text-sm text-gray-400")}>No payment methods on file</Text>
        </View>
      ) : (
        <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
          {paymentMethods.map((pm, i, arr) => {
            const expiry =
              pm.expiry_label ??
              (pm.expiry_month && pm.expiry_year
                ? `${String(pm.expiry_month).padStart(2, "0")}/${String(pm.expiry_year).slice(-2)}`
                : null);
            const busy = busyPaymentMethodId === pm.id;
            return (
              <View
                key={pm.id}
                style={twStyle(
                  `flex-row items-center px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-gray-50" : ""}`
                )}
                accessibilityLabel={`${pm.name} ending in ${pm.last4 ?? "****"}`}
              >
                <Ionicons
                  name={pm.type === "card" ? "card-outline" : "wallet-outline"}
                  size={20}
                  color="#6366f1"
                />
                <View style={twStyle("ml-3 flex-1")}>
                  <Text style={twStyle("text-sm font-medium text-gray-900")}>{pm.name}</Text>
                  <View style={twStyle("flex-row flex-wrap items-center")}>
                    {pm.last4 ? (
                      <Text style={twStyle("text-xs text-gray-500")}>•••• {pm.last4}</Text>
                    ) : null}
                    {expiry ? (
                      <Text
                        style={twStyle(
                          `${pm.last4 ? "ml-2" : ""} text-xs ${
                            pm.is_expired ? "font-semibold text-red-600" : "text-gray-500"
                          }`,
                        )}
                      >
                        {pm.is_expired ? "Expired" : "Expires"} {expiry}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {pm.is_default ? (
                  <View style={twStyle("mr-2 rounded-full bg-indigo-50 px-2.5 py-0.5")}>
                    <Text style={twStyle("text-xs font-medium text-indigo-700")}>Default</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => handleSetDefaultPaymentMethod(pm)}
                    disabled={busy}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={twStyle(
                      `mr-2 rounded-full bg-gray-50 px-2.5 py-1 ${busy ? "opacity-50" : ""}`,
                    )}
                    accessibilityRole="button"
                    accessibilityLabel={`Set ${pm.name} as default`}
                  >
                    <Text style={twStyle("text-xs font-medium text-gray-700")}>Set default</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => handleRemovePaymentMethod(pm)}
                  disabled={busy}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={twStyle(`p-1 ${busy ? "opacity-50" : ""}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${pm.name}`}
                >
                  <Ionicons name="trash-outline" size={18} color="#9ca3af" />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* ─── Invoices ─── */}
      <SectionHeader title="Invoices" />

      <View style={twStyle("mb-3")}>
        <FilterChipGroup
          options={[
            { label: "All", value: "all" },
            { label: "Unpaid", value: "sent,overdue" },
            { label: "Paid", value: "paid" },
          ]}
          selected={invoiceFilter}
          onSelect={setInvoiceFilter}
        />
      </View>

      {invoices.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No invoices"
          description="Your invoices will appear here"
        />
      ) : (
        <View style={twStyle("rounded-2xl border border-gray-100 bg-white")}>
          {invoices
            .filter((inv) => {
              if (invoiceFilter === "all") return true;
              return invoiceFilter.split(",").includes(inv.status);
            })
            .map((inv, i, arr) => {
              const st = invoiceStatusStyle(inv.status);
              return (
                <TouchableOpacity
                  key={inv.id}
                  style={twStyle(
                    `flex-row items-center px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-gray-50" : ""}`
                  )}
                  accessibilityLabel={`Invoice ${inv.invoice_number}, ${formatCurrency(inv.total_amount)}, ${inv.status}`}
                  onPress={() => setSelectedInvoice(inv)}
                >
                  <View
                    style={twStyle(
                      "mr-3 h-9 w-9 items-center justify-center rounded-lg bg-gray-50"
                    )}
                  >
                    <Ionicons name="document-text-outline" size={18} color="#6b7280" />
                  </View>
                  <View style={twStyle("flex-1")}>
                    <Text style={twStyle("text-sm font-medium text-gray-900")}>
                      {inv.invoice_number}
                    </Text>
                    <Text style={twStyle("text-xs text-gray-400")}>
                      {formatDate(inv.issue_date)}
                      {inv.due_date && !inv.paid_at ? ` · Due ${formatDate(inv.due_date)}` : ""}
                      {inv.paid_at ? ` · Paid ${formatDate(inv.paid_at)}` : ""}
                    </Text>
                  </View>
                  <View style={twStyle("items-end")}>
                    <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                      {formatCurrency(inv.total_amount)}
                    </Text>
                    <View style={twStyle(`mt-0.5 rounded-full px-2 py-0.5 ${st.bg}`)}>
                      <Text style={twStyle(`text-[10px] font-medium capitalize ${st.text}`)}>
                        {inv.status}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
        </View>
      )}

      <View style={twStyle("h-8")} />

      {/* ─── Invoice Detail Sheet ─── */}
      <BottomSheet
        visible={!!selectedInvoice}
        onClose={() => {
          setSelectedInvoice(null);
          setShowPayment(false);
        }}
        title={`Invoice ${selectedInvoice?.invoice_number ?? ""}`}
      >
        {selectedInvoice && (
          <View>
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <Text style={twStyle("text-sm text-gray-500")}>
                {formatDate(selectedInvoice.issue_date)}
              </Text>
              <View
                style={twStyle(
                  `rounded-full px-3 py-1 ${invoiceStatusStyle(selectedInvoice.status).bg}`
                )}
              >
                <Text
                  style={twStyle(
                    `text-xs font-medium capitalize ${invoiceStatusStyle(selectedInvoice.status).text}`
                  )}
                >
                  {selectedInvoice.status}
                </Text>
              </View>
            </View>

            <View style={twStyle("mb-3 rounded-xl border border-gray-200 bg-white p-4")}>
              <View style={twStyle("flex-row justify-between")}>
                <Text style={twStyle("text-sm text-gray-500")}>Amount</Text>
                <Text style={twStyle("text-lg font-bold text-gray-900")}>
                  {formatCurrency(selectedInvoice.total_amount)}
                </Text>
              </View>
              {selectedInvoice.due_date && (
                <View style={twStyle("mt-1 flex-row justify-between")}>
                  <Text style={twStyle("text-sm text-gray-500")}>Due Date</Text>
                  <Text style={twStyle("text-sm text-gray-700")}>
                    {formatDate(selectedInvoice.due_date)}
                  </Text>
                </View>
              )}
              {selectedInvoice.paid_at && (
                <View style={twStyle("mt-1 flex-row justify-between")}>
                  <Text style={twStyle("text-sm text-gray-500")}>Paid On</Text>
                  <Text style={twStyle("text-sm text-green-700")}>
                    {formatDate(selectedInvoice.paid_at)}
                  </Text>
                </View>
              )}
              {selectedInvoice.invoice_type && (
                <View style={twStyle("mt-1 flex-row justify-between")}>
                  <Text style={twStyle("text-sm text-gray-500")}>Type</Text>
                  <Text style={twStyle("text-sm text-gray-700 capitalize")}>
                    {selectedInvoice.invoice_type}
                  </Text>
                </View>
              )}
            </View>

            {/* Actions */}
            <View>
              <TouchableOpacity
                style={[
                  twStyle(
                    "flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-3"
                  ),
                  { marginBottom: 8 },
                ]}
                onPress={() => selectedInvoice && handleShareInvoice(selectedInvoice)}
                accessibilityLabel="Share invoice"
                accessibilityRole="button"
              >
                <Ionicons name="share-outline" size={18} color="#6366f1" />
                <Text style={twStyle("ml-2 text-sm font-medium text-indigo-600")}>
                  Share Invoice
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={twStyle(
                  "flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-3"
                )}
                onPress={() => selectedInvoice && handleDownloadInvoice(selectedInvoice)}
                accessibilityLabel="Download invoice"
                accessibilityRole="button"
              >
                <Ionicons name="download-outline" size={18} color="#6b7280" />
                <Text style={twStyle("ml-2 text-sm font-medium text-gray-700")}>Download</Text>
              </TouchableOpacity>

              {selectedInvoice.status !== "paid" && selectedInvoice.status !== "cancelled" && (
                <>
                  {!showPayment ? (
                    <ActionButton
                      label="Record Payment"
                      onPress={() => {
                        setPaymentAmount(String(selectedInvoice.total_amount));
                        setShowPayment(true);
                      }}
                      fullWidth
                    />
                  ) : (
                    <View style={twStyle("rounded-xl border border-gray-200 bg-gray-50 p-4")}>
                      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                        Payment Amount
                      </Text>
                      <TextInput
                        style={twStyle(
                          "mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
                        )}
                        value={paymentAmount}
                        onChangeText={setPaymentAmount}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor="#9ca3af"
                      />
                      <ActionButton
                        label="Confirm Payment"
                        onPress={async () => {
                          const amount = parseFloat(paymentAmount);
                          if (isNaN(amount) || amount <= 0) {
                            Alert.alert("Invalid", "Enter a valid amount");
                            return;
                          }
                          const { error: err } = await postAction(
                            `/api/provider/invoices/${selectedInvoice.id}/pay`,
                            { amount }
                          );
                          if (err) Alert.alert("Error", err);
                          else {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            setSelectedInvoice(null);
                            setShowPayment(false);
                            refresh();
                          }
                        }}
                        loading={paying}
                        fullWidth
                      />
                    </View>
                  )}

                  {selectedInvoice.status === "draft" && (
                    <TouchableOpacity
                      style={twStyle(
                        "flex-row items-center justify-center rounded-xl border border-blue-200 bg-blue-50 py-3"
                      )}
                      onPress={async () => {
                        const { error: err } = await patchInvoice(
                          `/api/provider/invoices/${selectedInvoice.id}`,
                          { status: "sent" }
                        );
                        if (err) Alert.alert("Error", err);
                        else {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          setSelectedInvoice(null);
                          refresh();
                        }
                      }}
                    >
                      <Ionicons name="send-outline" size={18} color="#2563eb" />
                      <Text style={twStyle("ml-2 text-sm font-medium text-blue-700")}>
                        Mark as Sent
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  Row Component                                                      */
/* ------------------------------------------------------------------ */

function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={twStyle("flex-row items-center py-2.5")}>
      <Ionicons name={icon} size={18} color="#6b7280" />
      <Text style={twStyle("ml-3 w-20 text-sm text-gray-500")}>{label}</Text>
      <Text style={twStyle("flex-1 text-sm text-gray-900")}>{value}</Text>
    </View>
  );
}
