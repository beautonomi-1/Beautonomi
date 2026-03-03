import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ActionButton } from "@/components/ui/ActionButton";

interface Promotion {
  id: string;
  code: string;
  type: string;
  value: number;
  description?: string | null;
  is_active: boolean;
  uses_count: number;
  max_uses?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
}

/** Content-only for use in Marketing hub (Promo codes tab). */
export function PromotionsContent() {
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [promoType, setPromoType] = useState<"percentage" | "fixed_amount">("percentage");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");

  const { data, loading, error, refresh } = useApi<Promotion[]>("/api/provider/promotions");
  const { execute: createPromo, loading: creating } = useApiMutation<Promotion>("post");
  const { execute: patchPromo } = useApiMutation("patch");
  const { execute: deletePromo } = useApiMutation("delete");

  const promotions: Promotion[] = Array.isArray(data) ? data : [];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      Alert.alert("Required", "Enter a promo code.");
      return;
    }
    const numValue = parseFloat(value.replace(/,/g, "."));
    if (Number.isNaN(numValue)) {
      Alert.alert("Invalid", "Enter a valid value.");
      return;
    }
    if (promoType === "percentage" && (numValue < 0 || numValue > 100)) {
      Alert.alert("Invalid", "Percentage must be between 0 and 100.");
      return;
    }
    if (promoType === "fixed_amount" && numValue < 0) {
      Alert.alert("Invalid", "Fixed amount must be 0 or more.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { error: err } = await createPromo("/api/provider/promotions", {
      code: trimmedCode,
      type: promoType,
      value: numValue,
      description: description.trim() || undefined,
    });
    if (err) {
      Alert.alert("Error", err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCreateOpen(false);
    setCode("");
    setValue("");
    setDescription("");
    setPromoType("percentage");
    refresh();
  }, [code, value, description, promoType, createPromo, refresh]);

  const toggleActive = useCallback(
    (p: Promotion) => {
      patchPromo(`/api/provider/promotions/${p.id}`, { is_active: !p.is_active }).then(
        ({ error: err }) => {
          if (err) Alert.alert("Error", err);
          else refresh();
        }
      );
    },
    [patchPromo, refresh]
  );

  const handleDelete = useCallback(
    (p: Promotion) => {
      Alert.alert("Delete promotion", `Remove code "${p.code}"?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deletePromo(`/api/provider/promotions/${p.id}`, {}).then(({ error: err }) => {
              if (err) Alert.alert("Error", err);
              else refresh();
            });
          },
        },
      ]);
    },
    [deletePromo, refresh]
  );

  if (loading && !data) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <LoadingState />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View className="flex-1 justify-center px-4">
        <ErrorState message={error} onRetry={refresh} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {promotions.length === 0 ? (
          <View className="items-center py-16">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-orange-100">
              <Ionicons name="pricetag-outline" size={32} color="#f97316" />
            </View>
            <Text className="text-center font-semibold text-gray-900">No promo codes yet</Text>
            <Text className="mt-1 text-center text-sm text-gray-500">
              Create promo codes for percentage or fixed-amount discounts.
            </Text>
            <TouchableOpacity
              onPress={() => setCreateOpen(true)}
              className="mt-6 flex-row items-center justify-center rounded-xl bg-orange-500 px-6 py-3"
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text className="ml-2 font-medium text-white">New promo code</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => setCreateOpen(true)}
              className="mb-3 flex-row items-center justify-center rounded-xl border border-orange-200 bg-orange-50 py-3"
            >
              <Ionicons name="add" size={18} color="#f97316" />
              <Text className="ml-2 font-medium text-orange-700">New promo code</Text>
            </TouchableOpacity>
            {promotions.map((p) => (
            <View
              key={p.id}
              className="mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4"
            >
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-orange-100">
                <Ionicons name="pricetag-outline" size={20} color="#f97316" />
              </View>
              <View className="ml-3 flex-1 min-w-0">
                <Text className="font-semibold text-gray-900">{p.code}</Text>
                <Text className="mt-0.5 text-sm text-gray-600">
                  {p.type === "percentage" ? `${p.value}% off` : `R ${Number(p.value).toFixed(2)} off`}
                  {p.description ? ` · ${p.description}` : ""}
                </Text>
                <Text className="mt-0.5 text-xs text-gray-500">
                  Used {p.uses_count}
                  {p.max_uses != null ? ` / ${p.max_uses}` : ""}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => toggleActive(p)}
                className={`mr-2 rounded-lg px-3 py-1.5 ${p.is_active ? "bg-green-100" : "bg-gray-100"}`}
              >
                <Text className={`text-xs font-medium ${p.is_active ? "text-green-800" : "text-gray-600"}`}>
                  {p.is_active ? "On" : "Off"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(p)}
                className="h-9 w-9 items-center justify-center rounded-lg bg-red-50"
              >
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
              </TouchableOpacity>
            </View>
          ))}
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New promo code"
        subtitle="Percentage or fixed amount"
      >
        <Text className="mb-2 text-sm font-medium text-gray-700">Code *</Text>
        <TextInput
          className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          placeholder="e.g. SAVE20"
          placeholderTextColor="#9ca3af"
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
        />
        <Text className="mb-2 text-sm font-medium text-gray-700">Type</Text>
        <View className="mb-4 flex-row gap-2">
          <TouchableOpacity
            onPress={() => setPromoType("percentage")}
            className={`flex-1 rounded-xl py-2.5 ${promoType === "percentage" ? "bg-orange-500" : "bg-gray-100"}`}
          >
            <Text
              className={`text-center text-sm font-medium ${promoType === "percentage" ? "text-white" : "text-gray-700"}`}
            >
              Percentage
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPromoType("fixed_amount")}
            className={`flex-1 rounded-xl py-2.5 ${promoType === "fixed_amount" ? "bg-orange-500" : "bg-gray-100"}`}
          >
            <Text
              className={`text-center text-sm font-medium ${promoType === "fixed_amount" ? "text-white" : "text-gray-700"}`}
            >
              Fixed amount
            </Text>
          </TouchableOpacity>
        </View>
        <Text className="mb-2 text-sm font-medium text-gray-700">
          Value {promoType === "percentage" ? "(0–100)" : "(R)"} *
        </Text>
        <TextInput
          className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          placeholder={promoType === "percentage" ? "20" : "50"}
          placeholderTextColor="#9ca3af"
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
        />
        <Text className="mb-2 text-sm font-medium text-gray-700">Description (optional)</Text>
        <TextInput
          className="mb-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          placeholder="e.g. Summer sale"
          placeholderTextColor="#9ca3af"
          value={description}
          onChangeText={setDescription}
        />
        <ActionButton
          label={creating ? "Creating…" : "Create promo code"}
          onPress={handleCreate}
          loading={creating}
          fullWidth
        />
      </BottomSheet>
    </>
  );
}

export default function PromotionsScreen() {
  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader
        title="Promotions"
        showBack
        subtitle="Promo codes & discounts"
      />
      <PromotionsContent />
    </ScreenContainer>
  );
}
