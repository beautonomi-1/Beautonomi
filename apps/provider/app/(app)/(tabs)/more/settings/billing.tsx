import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  TouchableOpacity,
  Linking,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
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

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  last4?: string;
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
  billingAddress: string | null;
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

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function BillingScreen() {
  useResponsive();
  const {
    data: billing,
    loading,
    error,
    refresh,
  } = useApi<BillingData>("/api/provider/settings/billing");
  const { execute: updateBilling, loading: saving } = useApiMutation("patch");

  const { execute: postAction, loading: paying } = useApiMutation("post");
  const { execute: patchInvoice } = useApiMutation("patch");

  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState("all");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [form, setForm] = useState({
    billingAddress: "",
    billingEmail: "",
    billingPhone: "",
  });

  useEffect(() => {
    if (billing) {
      setForm({
        billingAddress: billing.billingAddress ?? "",
        billingEmail: billing.billingEmail ?? "",
        billingPhone: billing.billingPhone ?? "",
      });
    }
  }, [billing]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  async function handleSave() {
    const { error: err } = await updateBilling(
      "/api/provider/settings/billing",
      {
        billing_address: form.billingAddress.trim() || null,
        billing_email: form.billingEmail.trim() || null,
        billing_phone: form.billingPhone.trim() || null,
      },
    );
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
      <View className="rounded-2xl border border-gray-100 bg-white p-4">
        {editing ? (
          <>
            <View className="mb-3">
              <Text className="mb-1 text-sm font-medium text-gray-700">
                Billing Address
              </Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={form.billingAddress}
                onChangeText={(t) => setForm((p) => ({ ...p, billingAddress: t }))}
                placeholder="Street, City, Code"
                placeholderTextColor="#9ca3af"
                multiline
                accessibilityLabel="Billing address"
              />
            </View>
            <View className="mb-3">
              <Text className="mb-1 text-sm font-medium text-gray-700">
                Billing Email
              </Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={form.billingEmail}
                onChangeText={(t) => setForm((p) => ({ ...p, billingEmail: t }))}
                placeholder="billing@example.com"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                accessibilityLabel="Billing email"
              />
            </View>
            <View className="mb-3">
              <Text className="mb-1 text-sm font-medium text-gray-700">
                Billing Phone
              </Text>
              <TextInput
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                value={form.billingPhone}
                onChangeText={(t) => setForm((p) => ({ ...p, billingPhone: t }))}
                placeholder="+27 81 234 5678"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
                accessibilityLabel="Billing phone"
              />
            </View>
            <ActionButton
              label="Save"
              onPress={handleSave}
              loading={saving}
              fullWidth
            />
          </>
        ) : (
          <>
            <Row
              icon="location-outline"
              label="Address"
              value={billing?.billingAddress ?? "Not set"}
            />
            <Row
              icon="mail-outline"
              label="Email"
              value={billing?.billingEmail ?? "Not set"}
            />
            <Row
              icon="call-outline"
              label="Phone"
              value={billing?.billingPhone ?? "Not set"}
            />
          </>
        )}
      </View>

      {/* ─── Payment Methods ─── */}
      <SectionHeader title="Payment Methods" />
      {paymentMethods.length === 0 ? (
        <View className="items-center rounded-2xl border border-gray-100 bg-white px-4 py-8">
          <Ionicons name="card-outline" size={24} color="#d1d5db" />
          <Text className="mt-2 text-sm text-gray-400">
            No payment methods on file
          </Text>
        </View>
      ) : (
        <View className="rounded-2xl border border-gray-100 bg-white">
          {paymentMethods.map((pm, i, arr) => (
            <View
              key={pm.id}
              className={`flex-row items-center px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-gray-50" : ""}`}
              accessibilityLabel={`${pm.name} ending in ${pm.last4 ?? "****"}`}
            >
              <Ionicons
                name={pm.type === "card" ? "card-outline" : "wallet-outline"}
                size={20}
                color="#6366f1"
              />
              <View className="ml-3 flex-1">
                <Text className="text-sm font-medium text-gray-900">
                  {pm.name}
                </Text>
                {pm.last4 && (
                  <Text className="text-xs text-gray-500">
                    •••• {pm.last4}
                  </Text>
                )}
              </View>
              {pm.is_default && (
                <View className="rounded-full bg-indigo-50 px-2.5 py-0.5">
                  <Text className="text-xs font-medium text-indigo-700">
                    Default
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* ─── Invoices ─── */}
      <SectionHeader title="Invoices" />

      <View className="mb-3">
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
        <View className="rounded-2xl border border-gray-100 bg-white">
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
                className={`flex-row items-center px-4 py-3.5 ${i < arr.length - 1 ? "border-b border-gray-50" : ""}`}
                accessibilityLabel={`Invoice ${inv.invoice_number}, ${formatCurrency(inv.total_amount)}, ${inv.status}`}
                onPress={() => setSelectedInvoice(inv)}
              >
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-lg bg-gray-50">
                  <Ionicons name="document-text-outline" size={18} color="#6b7280" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-900">
                    {inv.invoice_number}
                  </Text>
                  <Text className="text-xs text-gray-400">
                    {formatDate(inv.issue_date)}
                    {inv.due_date && !inv.paid_at
                      ? ` · Due ${formatDate(inv.due_date)}`
                      : ""}
                    {inv.paid_at ? ` · Paid ${formatDate(inv.paid_at)}` : ""}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-semibold text-gray-900">
                    {formatCurrency(inv.total_amount)}
                  </Text>
                  <View className={`mt-0.5 rounded-full px-2 py-0.5 ${st.bg}`}>
                    <Text className={`text-[10px] font-medium capitalize ${st.text}`}>
                      {inv.status}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View className="h-8" />

      {/* ─── Invoice Detail Sheet ─── */}
      <BottomSheet
        visible={!!selectedInvoice}
        onClose={() => { setSelectedInvoice(null); setShowPayment(false); }}
        title={`Invoice ${selectedInvoice?.invoice_number ?? ""}`}
      >
        {selectedInvoice && (
          <View>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm text-gray-500">{formatDate(selectedInvoice.issue_date)}</Text>
              <View className={`rounded-full px-3 py-1 ${invoiceStatusStyle(selectedInvoice.status).bg}`}>
                <Text className={`text-xs font-medium capitalize ${invoiceStatusStyle(selectedInvoice.status).text}`}>
                  {selectedInvoice.status}
                </Text>
              </View>
            </View>

            <View className="mb-3 rounded-xl border border-gray-200 bg-white p-4">
              <View className="flex-row justify-between">
                <Text className="text-sm text-gray-500">Amount</Text>
                <Text className="text-lg font-bold text-gray-900">{formatCurrency(selectedInvoice.total_amount)}</Text>
              </View>
              {selectedInvoice.due_date && (
                <View className="mt-1 flex-row justify-between">
                  <Text className="text-sm text-gray-500">Due Date</Text>
                  <Text className="text-sm text-gray-700">{formatDate(selectedInvoice.due_date)}</Text>
                </View>
              )}
              {selectedInvoice.paid_at && (
                <View className="mt-1 flex-row justify-between">
                  <Text className="text-sm text-gray-500">Paid On</Text>
                  <Text className="text-sm text-green-700">{formatDate(selectedInvoice.paid_at)}</Text>
                </View>
              )}
              {selectedInvoice.invoice_type && (
                <View className="mt-1 flex-row justify-between">
                  <Text className="text-sm text-gray-500">Type</Text>
                  <Text className="text-sm text-gray-700 capitalize">{selectedInvoice.invoice_type}</Text>
                </View>
              )}
            </View>

            {/* Actions */}
            <View className="gap-2">
              <TouchableOpacity
                className="flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-3"
                onPress={async () => {
                  try {
                    await Share.share({
                      url: `/api/provider/invoices/${selectedInvoice.id}/download`,
                      message: `Invoice ${selectedInvoice.invoice_number} - ${formatCurrency(selectedInvoice.total_amount)}`,
                    });
                  } catch {}
                }}
              >
                <Ionicons name="share-outline" size={18} color="#6366f1" />
                <Text className="ml-2 text-sm font-medium text-indigo-600">Share Invoice</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-row items-center justify-center rounded-xl border border-gray-200 bg-white py-3"
                onPress={() =>
                  Linking.openURL(`/api/provider/invoices/${selectedInvoice.id}/download`).catch(() => {})
                }
              >
                <Ionicons name="download-outline" size={18} color="#6b7280" />
                <Text className="ml-2 text-sm font-medium text-gray-700">Download</Text>
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
                    <View className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <Text className="mb-1 text-sm font-medium text-gray-700">Payment Amount</Text>
                      <TextInput
                        className="mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900"
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
                      className="flex-row items-center justify-center rounded-xl border border-blue-200 bg-blue-50 py-3"
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
                      <Text className="ml-2 text-sm font-medium text-blue-700">Mark as Sent</Text>
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
    <View className="flex-row items-center py-2.5">
      <Ionicons name={icon} size={18} color="#6b7280" />
      <Text className="ml-3 w-20 text-sm text-gray-500">{label}</Text>
      <Text className="flex-1 text-sm text-gray-900">{value}</Text>
    </View>
  );
}
