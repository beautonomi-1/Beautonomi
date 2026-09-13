import { useState, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
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
import { useRouter } from "expo-router";
import { useTranslation } from "@beautonomi/i18n";
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
import { verticalFlatListPerf } from "@/lib/flatListPerformance";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

interface CancellationPolicy {
  id: string;
  name: string;
  fee_type: "percentage" | "fixed";
  fee_amount: number;
  hours_before: number;
  refund_percentage: number;
  is_default: boolean;
  location_type: "at_salon" | "at_home" | "both" | null;
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
  location_type: "at_salon" | "at_home" | "both" | null;
}

const LOCATION_KEYS: Record<string, string> = {
  at_salon: "locationInSalon",
  at_home: "locationAtHome",
  both: "locationAll",
};

const EMPTY_FORM: PolicyForm = {
  name: "",
  fee_type: "percentage",
  fee_amount: "50",
  hours_before: "24",
  refund_percentage: "0",
  is_default: false,
  location_type: null,
};

export default function CancellationPoliciesScreen() {
  const { t } = useTranslation();
  const cp = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(`provider.mobile.screens.cancellationPolicies.${key}`, opts) as string,
    [t],
  );
  useResponsive();
  const router = useRouter();
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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
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
      location_type: policy.location_type ?? null,
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
    if (!form.name.trim()) errs.name = cp("nameRequired");
    const amount = parseFloat(form.fee_amount);
    if (isNaN(amount) || amount < 0) errs.fee_amount = cp("positiveNumber");
    else if (form.fee_type === "percentage" && amount > 100) errs.fee_amount = cp("cannotExceed100");
    const hours = parseInt(form.hours_before, 10);
    if (isNaN(hours) || hours < 0) errs.hours_before = cp("hoursMin");
    const refund = parseInt(form.refund_percentage, 10);
    if (isNaN(refund) || refund < 0 || refund > 100) errs.refund_percentage = cp("refundRange");
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
      location_type: form.location_type,
    };

    if (editingId) {
      const { error } = await updatePolicy(
        `/api/provider/cancellation-policies/${editingId}`,
        payload,
      );
      if (error) {
        Alert.alert(cp("errorTitle"), error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(cp("updatedTitle"), cp("updatedBody"));
    } else {
      const { error } = await createPolicy(payload);
      if (error) {
        Alert.alert(cp("errorTitle"), error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(cp("createdTitle"), cp("createdBody"));
    }
    setSheetVisible(false);
    refresh();
  }

  async function handleSetDefault(policy: CancellationPolicy) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await updatePolicy(
      `/api/provider/cancellation-policies/${policy.id}/set-default`,
      {},
    );
    if (error) {
      Alert.alert(cp("errorTitle"), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  function handleDelete(policy: CancellationPolicy) {
    Alert.alert(
      cp("deleteTitle"),
      cp("deleteBody", { name: policy.name }),
      [
        { text: cp("cancel"), style: "cancel" },
        {
          text: cp("delete"),
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const { error } = await deletePolicy(
              `/api/provider/cancellation-policies/${policy.id}`,
            );
            if (error) {
              Alert.alert(cp("errorTitle"), error);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refresh();
            }
          },
        },
      ],
    );
  }

  const locationOptions = [
    { value: null, label: cp("locationAny") },
    { value: "at_salon" as const, label: cp("locationInSalon") },
    { value: "at_home" as const, label: cp("locationAtHome") },
    { value: "both" as const, label: cp("locationBoth") },
  ];

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title={cp("title")}
        showBack
        subtitle={cp("subtitle", { count: policies?.length ?? 0 })}
        rightAction={
          <TouchableOpacity
            style={twStyle("h-10 w-10 items-center justify-center rounded-full bg-indigo-600")}
            onPress={openAddSheet}
            accessibilityLabel={cp("addPolicyA11y")}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        }
      />

      <TouchableOpacity
        style={twStyle("mx-4 mb-3 flex-row items-center rounded-xl border border-amber-100 bg-amber-50 px-4 py-3")}
        onPress={() => router.push("/(app)/(tabs)/more/settings/payments" as never)}
        accessibilityLabel={cp("noShowFeesA11y")}
        accessibilityRole="button"
      >
        <Ionicons name="alert-circle-outline" size={18} color="#d97706" />
        <Text style={twStyle("ms-2 flex-1 text-sm text-amber-900")}>
          {cp("noShowFeesHint")}
        </Text>
        <DirectionalIcon name="chevron-forward" size={16} color="#d97706" />
      </TouchableOpacity>

      {loading && !policies ? (
        <LoadingState />
      ) : !policies || policies.length === 0 ? (
        <EmptyState
          icon="close-circle-outline"
          title={cp("emptyTitle")}
          description={cp("emptyDescription")}
          actionLabel={cp("addPolicy")}
          onAction={openAddSheet}
        />
      ) : (
        <FlatList
          {...verticalFlatListPerf}
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
              accessibilityLabel={cp("policyA11y", { name: policy.name })}
            >
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
                    {policy.is_default ? cp("default") : cp("custom")}
                  </Text>
                </View>
              </View>

              <View style={twStyle("mt-2")}>
                <Text style={twStyle("text-xs text-gray-600")}>
                  {cp("moreThanHours", { hours: policy.hours_before })}
                </Text>
                <Text style={twStyle("mt-0.5 text-xs text-gray-600")}>
                  {cp("withinHoursLate", { hours: policy.hours_before, percent: policy.refund_percentage })}
                </Text>
                {policy.refund_percentage === 0 && policy.fee_amount > 0 ? (
                  <Text style={twStyle("mt-0.5 text-xs text-gray-600")}>
                    {cp("lateFee", {
                      amount:
                        policy.fee_type === "percentage"
                          ? cp("percentAmount", { amount: policy.fee_amount })
                          : formatCurrency(policy.fee_amount),
                    })}
                  </Text>
                ) : null}
                {policy.location_type ? (
                  <Text style={twStyle("mt-0.5 text-xs text-gray-500")}>
                    {cp("appliesTo", {
                      scope: LOCATION_KEYS[policy.location_type]
                        ? cp(LOCATION_KEYS[policy.location_type])
                        : policy.location_type,
                    })}
                  </Text>
                ) : null}
              </View>

              <View style={twStyle("mt-3 flex-row flex-wrap items-center border-t border-gray-50 pt-3")}>
                {!policy.is_default && (
                  <TouchableOpacity
                    style={[twStyle("mb-2 flex-row items-center justify-center rounded-lg bg-indigo-50 px-3 py-2"), { marginEnd: 8 }]}
                    onPress={() => handleSetDefault(policy)}
                    accessibilityLabel={cp("setDefaultA11y", { name: policy.name })}
                    accessibilityRole="button"
                  >
                    <Ionicons name="star-outline" size={14} color="#4f46e5" />
                    <Text style={twStyle("ms-1 text-xs font-medium text-indigo-700")}>
                      {cp("setDefault")}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[twStyle("flex-1 flex-row items-center justify-center rounded-lg bg-gray-100 py-2"), { marginEnd: 8 }]}
                  onPress={() => openEditSheet(policy)}
                  accessibilityLabel={cp("editA11y", { name: policy.name })}
                  accessibilityRole="button"
                >
                  <Ionicons name="create-outline" size={14} color="#6b7280" />
                  <Text style={twStyle("ms-1 text-xs font-medium text-gray-600")}>
                    {cp("edit")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={twStyle("flex-row items-center justify-center rounded-lg bg-red-50 px-4 py-2")}
                  onPress={() => handleDelete(policy)}
                  accessibilityLabel={cp("deleteA11y", { name: policy.name })}
                  accessibilityRole="button"
                >
                  <Ionicons name="trash-outline" size={14} color="#ef4444" />
                  <Text style={twStyle("ms-1 text-xs font-medium text-red-600")}>
                    {cp("delete")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <BottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={editingId ? cp("editPolicy") : cp("addPolicy")}
        snapHeight="half"
      >
        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {cp("policyNameLabel")}
          </Text>
          <TextInput
            style={twStyle(`rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 ${formErrors.name ? "border-red-400" : "border-gray-200"}`)}
            value={form.name}
            onChangeText={(v) => { updateField("name", v); setFormErrors((prev) => ({ ...prev, name: undefined })); }}
            placeholder={cp("policyNamePlaceholder")}
            placeholderTextColor="#9ca3af"
            accessibilityLabel={cp("policyNameA11y")}
          />
          {formErrors.name && <Text style={twStyle("mt-1 text-xs text-red-500")}>{formErrors.name}</Text>}
        </View>

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>
            {cp("feeType")}
          </Text>
          <View style={twStyle("flex-row")}>
            {(["percentage", "fixed"] as const).map((type) => (
              <TouchableOpacity
                key={type}
                style={[twStyle(`flex-1 items-center rounded-xl py-3 ${form.fee_type === type ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"}`), type === "percentage" ? { marginEnd: 8 } : undefined]}
                onPress={() => updateField("fee_type", type)}
                accessibilityLabel={cp("feeTypeA11y", { type: type === "percentage" ? cp("feeTypePercentage") : cp("feeTypeFixed") })}
                accessibilityRole="button"
              >
                <Text
                  style={twStyle(`text-sm font-medium ${form.fee_type === type ? "text-white" : "text-gray-600"}`)}
                >
                  {type === "percentage" ? cp("feeTypePercentage") : cp("feeTypeFixed")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {cp("feeAmount")}
          </Text>
          <View style={twStyle("flex-row items-center")}>
            {form.fee_type === "fixed" && (
              <Text style={twStyle("me-2 text-lg font-semibold text-gray-400")}>
                {cp("currencyPrefix")}
              </Text>
            )}
            <TextInput
              style={twStyle(`flex-1 rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 ${formErrors.fee_amount ? "border-red-400" : "border-gray-200"}`)}
              value={form.fee_amount}
              onChangeText={(v) => { updateField("fee_amount", v); setFormErrors((prev) => ({ ...prev, fee_amount: undefined })); }}
              keyboardType="decimal-pad"
              placeholder={form.fee_type === "percentage" ? "50" : "100.00"}
              placeholderTextColor="#9ca3af"
              accessibilityLabel={cp("feeAmountA11y")}
            />
            {form.fee_type === "percentage" && (
              <Text style={twStyle("ms-2 text-lg font-semibold text-gray-400")}>
                {cp("percentSymbol")}
              </Text>
            )}
          </View>
          {formErrors.fee_amount && <Text style={twStyle("mt-1 text-xs text-red-500")}>{formErrors.fee_amount}</Text>}
        </View>

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {cp("hoursBefore")}
          </Text>
          <View style={twStyle("flex-row items-center")}>
            <TextInput
              style={twStyle(`flex-1 rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 ${formErrors.hours_before ? "border-red-400" : "border-gray-200"}`)}
              value={form.hours_before}
              onChangeText={(v) => { updateField("hours_before", v); setFormErrors((prev) => ({ ...prev, hours_before: undefined })); }}
              keyboardType="number-pad"
              placeholder="24"
              placeholderTextColor="#9ca3af"
              accessibilityLabel={cp("hoursBeforeA11y")}
            />
            <Text style={twStyle("ms-2 text-sm text-gray-400")}>{cp("hoursSuffix")}</Text>
          </View>
          {formErrors.hours_before && <Text style={twStyle("mt-1 text-xs text-red-500")}>{formErrors.hours_before}</Text>}
        </View>

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
            {cp("refundPercentage")}
          </Text>
          <View style={twStyle("flex-row items-center")}>
            <TextInput
              style={twStyle(`flex-1 rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-900 ${formErrors.refund_percentage ? "border-red-400" : "border-gray-200"}`)}
              value={form.refund_percentage}
              onChangeText={(v) => { updateField("refund_percentage", v); setFormErrors((prev) => ({ ...prev, refund_percentage: undefined })); }}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#9ca3af"
              accessibilityLabel={cp("refundPercentageA11y")}
            />
            <Text style={twStyle("ms-2 text-lg font-semibold text-gray-400")}>
              {cp("percentSymbol")}
            </Text>
          </View>
          {formErrors.refund_percentage && <Text style={twStyle("mt-1 text-xs text-red-500")}>{formErrors.refund_percentage}</Text>}
        </View>

        <View style={twStyle("mb-4")}>
          <Text style={twStyle("mb-2 text-sm font-medium text-gray-700")}>{cp("appliesToLabel")}</Text>
          <View style={twStyle("flex-row flex-wrap")}>
            {locationOptions.map((opt) => {
              const selected = form.location_type === opt.value;
              return (
                <TouchableOpacity
                  key={opt.label}
                  style={[
                    twStyle(`rounded-full px-3 py-2 ${selected ? "bg-indigo-600" : "border border-gray-200 bg-gray-50"}`),
                    { marginEnd: 8, marginBottom: 8 },
                  ]}
                  onPress={() => updateField("location_type", opt.value)}
                  accessibilityLabel={cp("locationScopeA11y", { label: opt.label })}
                  accessibilityRole="button"
                >
                  <Text
                    style={twStyle(`text-xs font-medium ${selected ? "text-white" : "text-gray-600"}`)}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={twStyle("mb-6 flex-row items-center justify-between rounded-xl bg-gray-50 px-4 py-3")}>
          <Text style={twStyle("text-sm font-medium text-gray-700")}>
            {cp("setAsDefault")}
          </Text>
          <Switch
            value={form.is_default}
            onValueChange={(v) => updateField("is_default", v)}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={form.is_default ? "#6366f1" : "#f3f4f6"}
            accessibilityLabel={cp("toggleDefaultA11y")}
          />
        </View>

        <ActionButton
          label={
            isSaving
              ? cp("saving")
              : editingId
                ? cp("updatePolicy")
                : cp("addPolicy")
          }
          onPress={handleSave}
          loading={isSaving}
          fullWidth
        />
      </BottomSheet>
    </ScreenContainer>
  );
}
