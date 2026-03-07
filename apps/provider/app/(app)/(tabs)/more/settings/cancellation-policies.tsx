import { useState, useCallback } from "react";
import * as Haptics from "expo-haptics";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiPost, useApiMutation } from "@/hooks/useApi";
import { useResponsive } from "@/hooks/useResponsive";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActionButton } from "@/components/ui/ActionButton";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";

/* ─── types (aligned with API: hours_before, refund_percentage, is_default) ─── */
interface CancellationPolicy {
  id: string;
  name: string;
  fee_type: "percentage" | "fixed";
  fee_amount: number;
  hours_before: number;
  refund_percentage: number;
  is_default: boolean;
  provider_id: string;
  created_at: string;
  updated_at: string;
}

interface PolicyForm {
  name: string;
  fee_type: "percentage" | "fixed";
  fee_amount: string;
  hours_before: string;
  refund_percentage: string;
  is_default: boolean;
}

const EMPTY_FORM: PolicyForm = {
  name: "",
  fee_type: "percentage",
  fee_amount: "50",
  hours_before: "24",
  refund_percentage: "0",
  is_default: false,
};

/* ─── screen ─── */
export default function CancellationPoliciesScreen() {
  useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PolicyForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof PolicyForm, string>>>({});

  const {
    data: policies,
    loading,
    refresh,
  } = useApi<CancellationPolicy[]>("/api/provider/cancellation-policies");
  const { execute: createPolicy, loading: creating } = useApiPost<
    Record<string, unknown>,
    CancellationPolicy
  >("/api/provider/cancellation-policies");
  const { execute: updatePolicy, loading: updating } =
    useApiMutation("patch");
  const { execute: deletePolicy } = useApiMutation("delete");

  const isSaving = creating || updating;

  /* ─── handlers ─── */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  function openAddSheet() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setSheetVisible(true);
  }

  function openEditSheet(policy: CancellationPolicy) {
    setFormErrors({});
    setEditingId(policy.id);
    setForm({
      name: policy.name,
      fee_type: policy.fee_type,
      fee_amount: policy.fee_amount.toString(),
      hours_before: policy.hours_before.toString(),
      refund_percentage: (policy.refund_percentage ?? 0).toString(),
      is_default: policy.is_default ?? false,
    });
    setSheetVisible(true);
  }

  function updateField<K extends keyof PolicyForm>(
    key: K,
    value: PolicyForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateForm(): boolean {
    const errs: Partial<Record<keyof PolicyForm, string>> = {};
    if (!form.name.trim()) errs.name = "Policy name is required";
    const amount = parseFloat(form.fee_amount);
    if (isNaN(amount) || amount < 0) errs.fee_amount = "Must be a positive number";
    else if (form.fee_type === "percentage" && amount > 100) errs.fee_amount = "Cannot exceed 100%";
    const hours = parseInt(form.hours_before, 10);
    if (isNaN(hours) || hours < 0) errs.hours_before = "Must be 0 or more hours";
    const refund = parseInt(form.refund_percentage, 10);
    if (isNaN(refund) || refund < 0 || refund > 100) errs.refund_percentage = "Must be 0-100";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validateForm()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const payload = {
      name: form.name.trim(),
      fee_type: form.fee_type,
      fee_amount: parseFloat(form.fee_amount),
      hours_before: parseInt(form.hours_before, 10),
      refund_percentage: parseInt(form.refund_percentage, 10) || 0,
      is_default: form.is_default,
    };

    if (editingId) {
      const { error } = await updatePolicy(
        `/api/provider/cancellation-policies/${editingId}`,
        payload,
      );
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Updated", "Policy updated successfully.");
    } else {
      const { error } = await createPolicy(payload);
      if (error) {
        Alert.alert("Error", error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Created", "New cancellation policy added.");
    }
    setSheetVisible(false);
    refresh();
  }

  function handleDelete(policy: CancellationPolicy) {
    Alert.alert(
      "Delete Policy",
      `Are you sure you want to delete "${policy.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const { error } = await deletePolicy(
              `/api/provider/cancellation-policies/${policy.id}`,
            );
            if (error) {
              Alert.alert("Error", error);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refresh();
            }
          },
        },
      ],
    );
  }

  /* ─── render ─── */
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Cancellation Policies"
        showBack
        subtitle={`${policies?.length ?? 0} ${(policies?.length ?? 0) === 1 ? "policy" : "policies"}`}
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-indigo-600")}
            onPress={openAddSheet}
            accessibilityLabel="Add new cancellation policy"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        }
      />

      {loading && !policies ? (
        <LoadingState />
      ) : !policies || policies.length === 0 ? (
        <EmptyState
          icon="close-circle-outline"
          title="No policies"
          description="Set up cancellation policies to protect your business from no-shows."
          actionLabel="Add Policy"
          onAction={openAddSheet}
        />
      ) : (
        <FlatList
          data={policies}
          keyExtractor={(p: CancellationPolicy) => p.id}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={{ paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item: policy }: { item: CancellationPolicy }) => (
            <View
              style={twStyle("rounded-xl border border-gray-100 bg-white p-4")}
              accessibilityLabel={`Cancellation policy ${policy.name}`}
            >
              {/* Header */}
              <View style={twStyle("flex-row items-start justify-between")}>
                <View style={twStyle("flex-1")}>
                  <Text style={twStyle("text-base font-semibold text-gray-900")}>
                    {policy.name}
                  </Text>
                </View>
                <View
                  style={twStyle(`rounded-full px-2 py-0.5 ${policy.is_default ? "bg-indigo-50" : "bg-gray-100"}`)}
                >
                  <Text
                    style={twStyle(`text-xs font-medium ${policy.is_default ? "text-indigo-700" : "text-gray-500"}`)}
                  >
                    {policy.is_default ? "Default" : "Custom"}
                  </Text>
                </View>
              </View>

              {/* Details */}
              <View style={twStyle("mt-2 flex-row flex-wrap items-center")}>
                <View style={[twStyle("flex-row items-center"), { marginRight: 16 }]}>
                  <Ionicons name="time-outline" size={12} color="#9ca3af" />
                  <Text style={twStyle("ml-1 text-xs text-gray-500")}>
                    Within {policy.hours_before}h of appointment
                  </Text>
                </View>
                <View style={[twStyle("flex-row items-center"), { marginRight: 16 }]}>
                  <Ionicons name="cash-outline" size={12} color="#9ca3af" />
                  <Text style={twStyle("ml-1 text-xs text-gray-500")}>
                    {policy.fee_type === "percentage"
                      ? `${policy.fee_amount}%`
                      : formatCurrency(policy.fee_amount)}{" "}
                    fee
                  </Text>
                </View>
                {(policy.refund_percentage ?? 0) > 0 && (
                  <View style={twStyle("flex-row items-center")}>
                    <Ionicons name="return-down-back-outline" size={12} color="#9ca3af" />
                    <Text style={twStyle("ml-1 text-xs text-gray-500")}>
                      {policy.refund_percentage}% refund
                    </Text>
                  </View>
                )}
              </View>

              {/* Actions */}
              <View style={twStyle("mt-3 flex-row items-center border-t border-gray-50 pt-3")}>
                <TouchableOpacity
                  style={[twStyle("flex-1 flex-row items-center justify-center rounded-lg bg-gray-100 py-2"), { marginRight: 8 }]}
                  onPress={() => openEditSheet(policy)}
                  accessibilityLabel={`Edit ${policy.name} policy`}
                  accessibilityRole="button"
                >
                  <Ionicons name="create-outline" size={14} color="#6b7280" />
                  <Text style={twStyle("ml-1 text-xs font-medium text-gray-600")}>
                    Edit
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={twStyle("flex-row items-center justify-center rounded-lg bg-red-50 px-4 py-2")}
                  onPress={() => handleDelete(policy)}
                  accessibilityLabel={`Delete ${policy.name} policy`}
                  accessibilityRole="button"
                >
                  <Ionicons name="trash-outline" size={14} color="#ef4444" />
                  <Text style={twStyle("ml-1 text-xs font-medium text-red-600")}>
                    Delete
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* ─── Add / Edit Bottom Sheet ─── */}
      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={editingId ? "Edit Policy" : "Add Policy"}
        snapHeight="half"
      >
        {/* Name */}
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Policy Name <Text style={twStyle("text-red-500")}>*</Text>
          </Text>
          <TextInput
            style={twStyle(`rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 ${formErrors.name ? "border-red-400" : "border-gray-200"}`)}
            value={form.name}
            onChangeText={(v) => { updateField("name", v); setFormErrors((prev) => ({ ...prev, name: undefined })); }}
            placeholder="e.g. Standard cancellation"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="Policy name"
          />
          {formErrors.name && <Text style={twStyle("mt-1 text-xs text-red-500")}>{formErrors.name}</Text>}
        </View>

        {/* Fee Type */}
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
            Fee Type
          </Text>
          <View style={twStyle("flex-row")}>
            {(["percentage", "fixed"] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[twStyle(`flex-1 items-center rounded-xl py-3 ${form.fee_type === type ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"}`), type === "percentage" ? { marginRight: 8 } : undefined]}
                onPress={() => updateField("fee_type", type)}
                accessibilityLabel={`Fee type ${type}`}
                accessibilityRole="button"
              >
                <Text
                  style={twStyle(`text-sm font-medium capitalize ${form.fee_type === type ? "text-white" : "text-gray-600"}`)}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Fee Amount */}
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Fee Amount
          </Text>
          <View style={twStyle("flex-row items-center")}>
            {form.fee_type === "fixed" && (
              <Text style={twStyle("mr-2 text-lg font-semibold text-gray-400")}>
                R
              </Text>
            )}
            <TextInput
              style={twStyle(`flex-1 rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 ${formErrors.fee_amount ? "border-red-400" : "border-gray-200"}`)}
              value={form.fee_amount}
              onChangeText={(v) => { updateField("fee_amount", v); setFormErrors((prev) => ({ ...prev, fee_amount: undefined })); }}
              keyboardType="decimal-pad"
              placeholder={form.fee_type === "percentage" ? "50" : "100.00"}
              placeholderTextColor="#9ca3af"
              accessibilityLabel="Fee amount"
            />
            {form.fee_type === "percentage" && (
              <Text style={twStyle("ml-2 text-lg font-semibold text-gray-400")}>
                %
              </Text>
            )}
          </View>
          {formErrors.fee_amount && <Text style={twStyle("mt-1 text-xs text-red-500")}>{formErrors.fee_amount}</Text>}
        </View>

        {/* Hours Before */}
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Hours Before Appointment
          </Text>
          <View style={twStyle("flex-row items-center")}>
            <TextInput
              style={twStyle(`flex-1 rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 ${formErrors.hours_before ? "border-red-400" : "border-gray-200"}`)}
              value={form.hours_before}
              onChangeText={(v) => { updateField("hours_before", v); setFormErrors((prev) => ({ ...prev, hours_before: undefined })); }}
              keyboardType="number-pad"
              placeholder="24"
              placeholderTextColor="#9ca3af"
              accessibilityLabel="Hours before appointment"
            />
            <Text style={twStyle("ml-2 text-sm text-gray-400")}>hours</Text>
          </View>
          {formErrors.hours_before && <Text style={twStyle("mt-1 text-xs text-red-500")}>{formErrors.hours_before}</Text>}
        </View>

        {/* Refund Percentage */}
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            Refund Percentage
          </Text>
          <View style={twStyle("flex-row items-center")}>
            <TextInput
              style={twStyle(`flex-1 rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 ${formErrors.refund_percentage ? "border-red-400" : "border-gray-200"}`)}
              value={form.refund_percentage}
              onChangeText={(v) => { updateField("refund_percentage", v); setFormErrors((prev) => ({ ...prev, refund_percentage: undefined })); }}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#9ca3af"
              accessibilityLabel="Refund percentage"
            />
            <Text style={twStyle("ml-2 text-lg font-semibold text-gray-400")}>
              %
            </Text>
          </View>
          {formErrors.refund_percentage && <Text style={twStyle("mt-1 text-xs text-red-500")}>{formErrors.refund_percentage}</Text>}
        </View>

        {/* Default Toggle */}
        <View style={twStyle("mb-6 flex-row items-center justify-between rounded-xl bg-gray-50 px-4 py-3")}>
          <Text style={twStyle("text-sm font-medium text-gray-700")}>
            Set as Default Policy
          </Text>
          <Switch
            value={form.is_default}
            onValueChange={(v) => updateField("is_default", v)}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={form.is_default ? "#6366f1" : "#f3f4f6"}
            accessibilityLabel="Toggle default policy"
          />
        </View>

        {/* Save */}
        <ActionButton
          label={
            isSaving
              ? "Saving…"
              : editingId
                ? "Update Policy"
                : "Add Policy"
          }
          onPress={handleSave}
          loading={isSaving}
          fullWidth
        />
      </BottomSheet>
    </ScreenContainer>
  );
}
