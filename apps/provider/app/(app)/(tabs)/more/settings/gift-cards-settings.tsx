import { useState, useEffect } from "react";
import { View, Text, TextInput, Switch, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatCard } from "@/components/ui/StatCard";
import { formatCurrency } from "@/lib/format";

interface GiftCardSettings {
  enabled: boolean;
  terms: string | null;
  isUsingPlatformDefault: boolean;
  min_value: number;
  max_value: number;
  default_expiry_months: number;
  custom_min_value?: number | null;
  custom_max_value?: number | null;
  custom_expiry_months?: number | null;
  stats?: {
    total_sold: number;
    total_redeemed: number;
    outstanding_balance: number;
    active_cards: number;
  };
}

export default function GiftCardsSettingsScreen() {
  const { data: settings, loading, refresh } = useApi<GiftCardSettings>(
    "/api/provider/settings/sales/gift-cards"
  );
  const { execute: saveSettings, loading: saving } = useApiMutation("patch");

  const [enabled, setEnabled] = useState(false);
  const [useCustom, setUseCustom] = useState(false);
  const [customMin, setCustomMin] = useState("");
  const [customMax, setCustomMax] = useState("");
  const [customExpiry, setCustomExpiry] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      const hasCustom =
        settings.custom_min_value != null ||
        settings.custom_max_value != null ||
        settings.custom_expiry_months != null;
      setUseCustom(hasCustom);
      setCustomMin(
        settings.custom_min_value != null
          ? String(settings.custom_min_value)
          : ""
      );
      setCustomMax(
        settings.custom_max_value != null
          ? String(settings.custom_max_value)
          : ""
      );
      setCustomExpiry(
        settings.custom_expiry_months != null
          ? String(settings.custom_expiry_months)
          : ""
      );
    }
  }, [settings]);

  function update(fn: () => void) {
    fn();
    setDirty(true);
  }

  async function handleSave() {
    const payload: Record<string, unknown> = {
      gift_cards_enabled: enabled,
    };
    if (useCustom) {
      if (customMin) payload.custom_min_value = Number(customMin);
      if (customMax) payload.custom_max_value = Number(customMax);
      if (customExpiry) payload.custom_expiry_months = Number(customExpiry);
    } else {
      payload.custom_min_value = null;
      payload.custom_max_value = null;
      payload.custom_expiry_months = null;
    }
    const { error } = await saveSettings(
      "/api/provider/settings/sales/gift-cards",
      payload
    );
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDirty(false);
    refresh();
  }

  if (loading && !settings) {
    return (
      <ScreenContainer>
        <ScreenHeader title="Gift Card Settings" showBack />
        <LoadingState message="Loading settings..." />
      </ScreenContainer>
    );
  }

  const stats = settings?.stats;

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Gift Card Settings"
        showBack
        subtitle="Configure gift cards"
      />

      {stats && (
        <View className="mb-4">
          <View className="flex-row gap-2">
            <View className="flex-1">
              <StatCard
                title="Sold"
                value={formatCurrency(stats.total_sold)}
                icon="card-outline"
                iconColor="#22c55e"
                iconBg="bg-green-50"
                compact
              />
            </View>
            <View className="flex-1">
              <StatCard
                title="Active"
                value={String(stats.active_cards)}
                icon="gift-outline"
                iconColor="#a855f7"
                iconBg="bg-purple-50"
                compact
              />
            </View>
          </View>
          <View className="mt-2 flex-row gap-2">
            <View className="flex-1">
              <StatCard
                title="Redeemed"
                value={formatCurrency(stats.total_redeemed)}
                icon="checkmark-circle-outline"
                iconColor="#6366f1"
                iconBg="bg-indigo-50"
                compact
              />
            </View>
            <View className="flex-1">
              <StatCard
                title="Outstanding"
                value={formatCurrency(stats.outstanding_balance)}
                icon="wallet-outline"
                iconColor="#f59e0b"
                iconBg="bg-amber-50"
                compact
              />
            </View>
          </View>
        </View>
      )}

      {settings?.isUsingPlatformDefault && !useCustom && (
        <View className="mb-4 flex-row rounded-xl border border-amber-100 bg-amber-50 p-3">
          <Ionicons
            name="information-circle"
            size={16}
            color="#f59e0b"
            style={{ marginTop: 1 }}
          />
          <Text className="ml-2 flex-1 text-xs leading-4 text-amber-700">
            Using platform defaults. Enable custom values to override.
          </Text>
        </View>
      )}

      <View className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row flex-1 items-center">
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-purple-50">
              <Ionicons name="gift" size={22} color="#a855f7" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-[15px] font-semibold text-gray-900">
                Enable Gift Cards
              </Text>
              <Text className="text-xs text-gray-500">
                Allow clients to purchase and redeem gift cards
              </Text>
            </View>
          </View>
          <Switch
            value={enabled}
            onValueChange={(v) => update(() => setEnabled(v))}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={enabled ? "#6366f1" : "#f4f4f5"}
          />
        </View>
      </View>

      {enabled && (
        <>
          {/* Platform defaults display */}
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Platform Defaults
          </Text>
          <View className="mb-4 rounded-xl bg-gray-50 p-4">
            <View className="mb-2 flex-row justify-between">
              <Text className="text-xs text-gray-500">Min Value</Text>
              <Text className="text-sm font-medium text-gray-900">
                R {settings?.min_value ?? 50}
              </Text>
            </View>
            <View className="mb-2 flex-row justify-between">
              <Text className="text-xs text-gray-500">Max Value</Text>
              <Text className="text-sm font-medium text-gray-900">
                R {settings?.max_value ?? 10000}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-xs text-gray-500">Default Expiry</Text>
              <Text className="text-sm font-medium text-gray-900">
                {settings?.default_expiry_months ?? 12} months
              </Text>
            </View>
          </View>

          {/* Custom overrides */}
          <View className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-900">
                  Custom Values
                </Text>
                <Text className="text-xs text-gray-500">
                  Override platform defaults
                </Text>
              </View>
              <Switch
                value={useCustom}
                onValueChange={(v) => update(() => setUseCustom(v))}
                trackColor={{ false: "#d1d5db", true: "#818cf8" }}
                thumbColor={useCustom ? "#6366f1" : "#f4f4f5"}
              />
            </View>

            {useCustom && (
              <>
                <View className="border-t border-gray-100 pt-3">
                  <Text className="mb-1 text-sm font-medium text-gray-700">
                    Min Value (R)
                  </Text>
                  <TextInput
                    className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                    value={customMin}
                    onChangeText={(t) => update(() => setCustomMin(t))}
                    keyboardType="decimal-pad"
                    placeholder={`Default: ${settings?.min_value ?? 50}`}
                    placeholderTextColor="#9ca3af"
                  />
                  <Text className="mb-1 text-sm font-medium text-gray-700">
                    Max Value (R)
                  </Text>
                  <TextInput
                    className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                    value={customMax}
                    onChangeText={(t) => update(() => setCustomMax(t))}
                    keyboardType="decimal-pad"
                    placeholder={`Default: ${settings?.max_value ?? 10000}`}
                    placeholderTextColor="#9ca3af"
                  />
                  <Text className="mb-1 text-sm font-medium text-gray-700">
                    Expiry (months)
                  </Text>
                  <TextInput
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                    value={customExpiry}
                    onChangeText={(t) => update(() => setCustomExpiry(t))}
                    keyboardType="number-pad"
                    placeholder={`Default: ${settings?.default_expiry_months ?? 12}`}
                    placeholderTextColor="#9ca3af"
                  />
                </View>
              </>
            )}
          </View>

          {/* How it works */}
          <View className="mb-4 rounded-xl bg-indigo-50 p-4">
            <Text className="mb-2 text-sm font-semibold text-indigo-900">
              How Gift Cards Work
            </Text>
            <View className="gap-2">
              {[
                "Clients purchase gift cards through your booking page or in-store",
                "Gift cards can be sent via email with a personal message",
                "Recipients redeem the card code at checkout for services or products",
              ].map((step, idx) => (
                <View key={idx} className="flex-row items-start">
                  <View className="mt-0.5 h-4 w-4 items-center justify-center rounded-full bg-indigo-200">
                    <Text className="text-[9px] font-bold text-indigo-700">
                      {idx + 1}
                    </Text>
                  </View>
                  <Text className="ml-2 flex-1 text-xs text-indigo-700">
                    {step}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {settings?.terms && (
            <View className="mb-4 rounded-xl border border-gray-100 bg-white p-4">
              <Text className="mb-1 text-xs font-medium text-gray-500">
                Terms & Conditions
              </Text>
              <Text className="text-sm leading-5 text-gray-700">
                {settings.terms}
              </Text>
            </View>
          )}
        </>
      )}

      <ActionButton
        label="Save Settings"
        onPress={handleSave}
        loading={saving}
        disabled={!dirty}
        fullWidth
      />
      <View className="h-8" />
    </ScreenContainer>
  );
}
