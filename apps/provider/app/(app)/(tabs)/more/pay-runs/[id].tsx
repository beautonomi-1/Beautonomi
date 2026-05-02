/**
 * Provider pay-run detail screen.
 *
 * §Provider-launch (audit 2026-04): previously the mobile payroll list
 * could only view + approve + mark-paid; providers had to use the web
 * dashboard for the per-staff line items (deductions, PAYE, UIF, notes).
 * This screen consumes GET/PATCH `/api/provider/pay-runs/[id]` so owners
 * can inspect items and adjust manual deductions natively, bringing
 * parity with the web pay-run detail page before launch.
 */
import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { useProvider } from "@/providers/ProviderContext";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";
import { twStyle } from "@/lib/twStyle";

interface PayRunItem {
  id: string;
  staff_id: string;
  staff_name: string;
  gross_pay: number;
  commission_amount: number | null;
  hourly_amount: number | null;
  salary_amount: number | null;
  tips_amount: number | null;
  manual_deductions: number | null;
  tax_deduction: number | null;
  uif_contribution: number | null;
  taxable_income: number | null;
  net_pay: number;
  notes: string | null;
}

interface PayRunDetail {
  id: string;
  pay_period_start: string;
  pay_period_end: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  total_gross_pay?: number | null;
  total_net_pay?: number | null;
  total_tax_deductions?: number | null;
  total_uif?: number | null;
  items: PayRunItem[];
}

function formatDateSafe(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatMoneySafe(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function isPayrollOwnerRole(role: string | null): boolean {
  return role === "provider_owner" || role === "superadmin";
}

function unwrap<T>(raw: unknown): T | null {
  if (!raw) return null;
  if (typeof raw === "object" && raw !== null && "data" in (raw as Record<string, unknown>)) {
    const inner = (raw as { data: unknown }).data;
    if (inner) return inner as T;
  }
  return raw as T;
}

export default function PayRunDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { role } = useProvider();
  const { screenPadding } = useResponsive();
  const isOwner = isPayrollOwnerRole(role);

  const apiPath = id ? `/api/provider/pay-runs/${id}` : "/api/provider/pay-runs/__missing__";
  const { data: rawData, loading, error: loadError, refresh } = useApi<PayRunDetail>(apiPath, {
    enabled: !!id,
  });
  const data = useMemo(() => unwrap<PayRunDetail>(rawData), [rawData]);
  const items: PayRunItem[] = useMemo(
    () => (Array.isArray(data?.items) ? data!.items : []),
    [data]
  );

  const [refreshing, setRefreshing] = useState(false);
  const [editItem, setEditItem] = useState<PayRunItem | null>(null);
  const [manualInput, setManualInput] = useState("0");
  const [taxInput, setTaxInput] = useState("0");
  const [uifInput, setUifInput] = useState("0");
  const [notesInput, setNotesInput] = useState("");

  const { execute: approveRun } = useApiMutation("post");
  const { execute: markPaidRun } = useApiMutation("post");
  const { execute: patchItem, loading: saving } = useApiMutation("patch");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const isDraft = data?.status === "draft";
  const canEdit = isOwner && isDraft;

  const openEdit = useCallback((item: PayRunItem) => {
    if (!canEdit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditItem(item);
    setManualInput(String(Number(item.manual_deductions ?? 0)));
    setTaxInput(String(Number(item.tax_deduction ?? 0)));
    setUifInput(String(Number(item.uif_contribution ?? 0)));
    setNotesInput(item.notes ?? "");
  }, [canEdit]);

  const closeEdit = useCallback(() => {
    if (saving) return;
    setEditItem(null);
  }, [saving]);

  const parseMoneyInput = (raw: string): number => {
    const n = parseFloat(raw.replace(/,/g, "."));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100) / 100;
  };

  const handleSaveItem = useCallback(async () => {
    if (!editItem || !id) return;
    const payload = {
      items: [
        {
          item_id: editItem.id,
          manual_deductions: parseMoneyInput(manualInput),
          tax_deduction: parseMoneyInput(taxInput),
          uif_contribution: parseMoneyInput(uifInput),
          notes: notesInput.trim() || undefined,
        },
      ],
    };
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await patchItem(`/api/provider/pay-runs/${id}`, payload);
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditItem(null);
    refresh();
  }, [editItem, id, manualInput, taxInput, uifInput, notesInput, patchItem, refresh]);

  const handleApprove = useCallback(() => {
    if (!data || data.status !== "draft" || !isOwner) return;
    Alert.alert(
      "Approve pay run?",
      "This will lock the pay run for payment. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const { error: err } = await approveRun(`/api/provider/pay-runs/${data.id}/approve`, {});
            if (err) {
              Alert.alert("Error", err);
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            refresh();
          },
        },
      ]
    );
  }, [data, isOwner, approveRun, refresh]);

  const handleMarkPaid = useCallback(() => {
    if (!data || data.status !== "approved" || !isOwner) return;
    Alert.alert(
      "Mark as paid?",
      "Confirm that this pay run has been paid out to staff.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark paid",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const { error: err } = await markPaidRun(`/api/provider/pay-runs/${data.id}/mark-paid`, {});
            if (err) {
              Alert.alert("Error", err);
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            refresh();
          },
        },
      ]
    );
  }, [data, isOwner, markPaidRun, refresh]);

  if (loading && !data && !loadError) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Pay run" onBack={() => router.back()} />
        <View style={twStyle("flex-1 items-center justify-center py-12")}>
          <LoadingState />
        </View>
      </ScreenContainer>
    );
  }

  if (loadError && !data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Pay run" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message={loadError} onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  if (!data) {
    return (
      <ScreenContainer scrollable={false}>
        <ScreenHeader title="Pay run" onBack={() => router.back()} />
        <View style={twStyle("flex-1 justify-center px-4")}>
          <ErrorState message="Pay run not found" onRetry={refresh} />
        </View>
      </ScreenContainer>
    );
  }

  const totalGross = Number(data.total_gross_pay ?? items.reduce((s, i) => s + Number(i.gross_pay || 0), 0));
  const totalNet = Number(data.total_net_pay ?? items.reduce((s, i) => s + Number(i.net_pay || 0), 0));
  const totalTax = Number(data.total_tax_deductions ?? items.reduce((s, i) => s + Number(i.tax_deduction || 0), 0));
  const totalUif = Number(data.total_uif ?? items.reduce((s, i) => s + Number(i.uif_contribution || 0), 0));

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Pay run"
        onBack={() => router.back()}
        subtitle={`${formatDateSafe(data.pay_period_start)} – ${formatDateSafe(data.pay_period_end)}`}
      />
      <ScrollView
        style={twStyle("flex-1")}
        contentContainerStyle={{ paddingHorizontal: screenPadding, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={twStyle("mb-4 rounded-2xl border border-gray-200 bg-white p-4")}>
          <View style={twStyle("flex-row items-center justify-between")}>
            <Text style={twStyle("text-sm font-medium text-gray-500")}>Status</Text>
            <View
              style={twStyle(`rounded-full px-2.5 py-1 ${
                data.status === "paid"
                  ? "bg-gray-100"
                  : data.status === "approved"
                    ? "bg-amber-100"
                    : "bg-blue-100"
              }`)}
            >
              <Text
                style={twStyle(`text-xs font-medium capitalize ${
                  data.status === "paid"
                    ? "text-gray-700"
                    : data.status === "approved"
                      ? "text-amber-800"
                      : "text-blue-800"
                }`)}
              >
                {data.status}
              </Text>
            </View>
          </View>
          <View style={twStyle("mt-3 flex-row flex-wrap")}>
            <View style={twStyle("w-1/2 pr-2 pb-2")}>
              <Text style={twStyle("text-xs text-gray-500")}>Gross</Text>
              <Text style={twStyle("text-base font-semibold text-gray-900")}>
                {formatMoneySafe(totalGross)}
              </Text>
            </View>
            <View style={twStyle("w-1/2 pl-2 pb-2")}>
              <Text style={twStyle("text-xs text-gray-500")}>Net</Text>
              <Text style={twStyle("text-base font-semibold text-emerald-700")}>
                {formatMoneySafe(totalNet)}
              </Text>
            </View>
            <View style={twStyle("w-1/2 pr-2")}>
              <Text style={twStyle("text-xs text-gray-500")}>PAYE / Tax</Text>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                {formatMoneySafe(totalTax)}
              </Text>
            </View>
            <View style={twStyle("w-1/2 pl-2")}>
              <Text style={twStyle("text-xs text-gray-500")}>UIF</Text>
              <Text style={twStyle("text-sm font-medium text-gray-900")}>
                {formatMoneySafe(totalUif)}
              </Text>
            </View>
          </View>
          {canEdit && (
            <View style={twStyle("mt-3 rounded-xl bg-blue-50 p-3")}>
              <Text style={twStyle("text-xs text-blue-900")}>
                Tap any row below to adjust manual deductions, PAYE, UIF, or notes while this run is
                still a draft.
              </Text>
            </View>
          )}
        </View>

        {items.length === 0 ? (
          <View style={twStyle("rounded-2xl border border-gray-200 bg-white p-6 items-center")}>
            <Ionicons name="people-outline" size={32} color="#9ca3af" />
            <Text style={twStyle("mt-2 text-sm text-gray-500 text-center")}>
              No staff items are included in this pay run.
            </Text>
          </View>
        ) : (
          items.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => openEdit(item)}
              activeOpacity={canEdit ? 0.7 : 1}
              style={twStyle("mb-3 rounded-2xl border border-gray-200 bg-white p-4")}
              accessibilityRole="button"
              accessibilityLabel={`Pay run item for ${item.staff_name}`}
              accessibilityState={{ disabled: !canEdit }}
            >
              <View style={twStyle("flex-row items-start justify-between")}>
                <View style={twStyle("flex-1 pr-3")}>
                  <Text style={twStyle("text-base font-semibold text-gray-900")}>
                    {item.staff_name}
                  </Text>
                  {Number(item.commission_amount ?? 0) > 0 && (
                    <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                      Commission {formatMoneySafe(item.commission_amount)}
                    </Text>
                  )}
                  {Number(item.hourly_amount ?? 0) > 0 && (
                    <Text style={twStyle("text-xs text-gray-500")}>
                      Hourly {formatMoneySafe(item.hourly_amount)}
                    </Text>
                  )}
                  {Number(item.salary_amount ?? 0) > 0 && (
                    <Text style={twStyle("text-xs text-gray-500")}>
                      Salary {formatMoneySafe(item.salary_amount)}
                    </Text>
                  )}
                  {Number(item.tips_amount ?? 0) > 0 && (
                    <Text style={twStyle("text-xs text-gray-500")}>
                      Tips {formatMoneySafe(item.tips_amount)}
                    </Text>
                  )}
                </View>
                <View style={twStyle("items-end")}>
                  <Text style={twStyle("text-xs text-gray-500")}>Gross</Text>
                  <Text style={twStyle("text-sm font-semibold text-gray-900")}>
                    {formatMoneySafe(item.gross_pay)}
                  </Text>
                </View>
              </View>

              <View style={twStyle("mt-3 flex-row flex-wrap")}>
                <View style={twStyle("w-1/2 pr-2 pb-1")}>
                  <Text style={twStyle("text-xs text-gray-500")}>Manual deductions</Text>
                  <Text style={twStyle("text-sm font-medium text-gray-900")}>
                    {formatMoneySafe(item.manual_deductions)}
                  </Text>
                </View>
                <View style={twStyle("w-1/2 pl-2 pb-1")}>
                  <Text style={twStyle("text-xs text-gray-500")}>PAYE / Tax</Text>
                  <Text style={twStyle("text-sm font-medium text-gray-900")}>
                    {formatMoneySafe(item.tax_deduction)}
                  </Text>
                </View>
                <View style={twStyle("w-1/2 pr-2")}>
                  <Text style={twStyle("text-xs text-gray-500")}>UIF</Text>
                  <Text style={twStyle("text-sm font-medium text-gray-900")}>
                    {formatMoneySafe(item.uif_contribution)}
                  </Text>
                </View>
                <View style={twStyle("w-1/2 pl-2")}>
                  <Text style={twStyle("text-xs text-gray-500")}>Net pay</Text>
                  <Text style={twStyle("text-sm font-semibold text-emerald-700")}>
                    {formatMoneySafe(item.net_pay)}
                  </Text>
                </View>
              </View>

              {item.notes ? (
                <View style={twStyle("mt-3 rounded-lg bg-gray-50 px-3 py-2")}>
                  <Text style={twStyle("text-xs text-gray-600")}>{item.notes}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))
        )}

        {data.status === "draft" && isOwner && (
          <TouchableOpacity
            onPress={handleApprove}
            style={twStyle("mt-2 flex-row items-center justify-center rounded-xl bg-emerald-600 py-3.5")}
            accessibilityRole="button"
            accessibilityLabel="Approve pay run"
          >
            <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
            <Text style={twStyle("ml-2 text-sm font-semibold text-white")}>Approve pay run</Text>
          </TouchableOpacity>
        )}
        {data.status === "approved" && isOwner && (
          <TouchableOpacity
            onPress={handleMarkPaid}
            style={twStyle("mt-2 flex-row items-center justify-center rounded-xl bg-gray-800 py-3.5")}
            accessibilityRole="button"
            accessibilityLabel="Mark pay run as paid"
          >
            <Ionicons name="cash-outline" size={18} color="#fff" />
            <Text style={twStyle("ml-2 text-sm font-semibold text-white")}>Mark as paid</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <BottomSheet
        visible={!!editItem}
        onClose={closeEdit}
        title={editItem?.staff_name ?? "Pay run item"}
        subtitle="Adjust deductions and notes"
      >
        <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>
          Manual deductions
        </Text>
        <TextInput
          value={manualInput}
          onChangeText={setManualInput}
          keyboardType="decimal-pad"
          placeholder="0.00"
          editable={!saving}
          style={twStyle(
            "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          )}
          accessibilityLabel="Manual deductions amount"
        />
        <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>PAYE / Tax</Text>
        <TextInput
          value={taxInput}
          onChangeText={setTaxInput}
          keyboardType="decimal-pad"
          placeholder="0.00"
          editable={!saving}
          style={twStyle(
            "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          )}
          accessibilityLabel="Tax deduction amount"
        />
        <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>UIF contribution</Text>
        <TextInput
          value={uifInput}
          onChangeText={setUifInput}
          keyboardType="decimal-pad"
          placeholder="0.00"
          editable={!saving}
          style={twStyle(
            "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          )}
          accessibilityLabel="UIF contribution amount"
        />
        <Text style={twStyle("mb-1 text-xs font-medium text-gray-600")}>Notes</Text>
        <TextInput
          value={notesInput}
          onChangeText={setNotesInput}
          placeholder="Optional notes for this line item"
          editable={!saving}
          multiline
          style={twStyle(
            "mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900 min-h-[80px]"
          )}
          accessibilityLabel="Line item notes"
        />
        <ActionButton
          label={saving ? "Saving…" : "Save changes"}
          onPress={handleSaveItem}
          loading={saving}
          fullWidth
        />
      </BottomSheet>
    </ScreenContainer>
  );
}
