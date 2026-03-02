import { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, Alert, Switch } from "react-native";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatCard } from "@/components/ui/StatCard";
import { formatCurrency } from "@/lib/format";

interface TravelFeeSettings {
  enabled: boolean;
  rate_per_km: number | null;
  minimum_fee: number | null;
  maximum_fee: number | null;
  free_within_km: number | null;
  currency: string;
  use_platform_default: boolean;
  stats?: {
    total_travel_fees_month: number;
    avg_fee: number;
    total_trips: number;
  };
}

export default function TravelFeesScreen() {
  const { data: settings, loading, refresh } = useApi<TravelFeeSettings>("/api/provider/travel-fees");
  const { execute: saveSettings, loading: saving } = useApiMutation("patch");

  const [enabled, setEnabled] = useState(true);
  const [usePlatformDefault, setUsePlatformDefault] = useState(true);
  const [ratePerKm, setRatePerKm] = useState("");
  const [minimumFee, setMinimumFee] = useState("");
  const [maximumFee, setMaximumFee] = useState("");
  const [freeWithin, setFreeWithin] = useState("");
  const [dirty, setDirty] = useState(false);
  const [previewKm, setPreviewKm] = useState("10");

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setUsePlatformDefault(settings.use_platform_default);
      setRatePerKm(settings.rate_per_km != null ? String(settings.rate_per_km) : "");
      setMinimumFee(settings.minimum_fee != null ? String(settings.minimum_fee) : "");
      setMaximumFee(settings.maximum_fee != null ? String(settings.maximum_fee) : "");
      setFreeWithin(settings.free_within_km != null ? String(settings.free_within_km) : "");
    }
  }, [settings]);

  function update(fn: () => void) {
    fn();
    setDirty(true);
  }

  const previewFee = useMemo(() => {
    if (usePlatformDefault || !ratePerKm) return null;
    const km = parseFloat(previewKm) || 0;
    const freeKm = parseFloat(freeWithin) || 0;
    const chargeableKm = Math.max(0, km - freeKm);
    const rate = parseFloat(ratePerKm) || 0;
    const minFee = parseFloat(minimumFee) || 0;
    const maxFee = parseFloat(maximumFee) || Infinity;
    let fee = chargeableKm * rate;
    fee = Math.max(fee, minFee);
    if (maxFee < Infinity) fee = Math.min(fee, maxFee);
    return fee;
  }, [ratePerKm, minimumFee, maximumFee, freeWithin, previewKm, usePlatformDefault]);

  async function handleSave() {
    const payload: Record<string, unknown> = {
      enabled,
      use_platform_default: usePlatformDefault,
    };
    if (!usePlatformDefault) {
      payload.rate_per_km = Number(ratePerKm) || 0;
      payload.minimum_fee = Number(minimumFee) || 0;
      payload.maximum_fee = maximumFee ? Number(maximumFee) : null;
      payload.free_within_km = freeWithin ? Number(freeWithin) : null;
    }
    const { error } = await saveSettings("/api/provider/travel-fees", payload);
    if (error) Alert.alert("Error", error);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDirty(false);
      refresh();
    }
  }

  if (loading && !settings) return <LoadingState />;

  const stats = settings?.stats;

  return (
    <ScreenContainer>
      <ScreenHeader title="Travel Fees" showBack subtitle="Fees for at-home services" />

      {stats && (
        <View className="mb-4 flex-row gap-2">
          <View className="flex-1">
            <StatCard
              title="This Month"
              value={formatCurrency(stats.total_travel_fees_month)}
              icon="car-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Avg Fee"
              value={formatCurrency(stats.avg_fee)}
              icon="calculator-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
          <View className="flex-1">
            <StatCard
              title="Trips"
              value={String(stats.total_trips)}
              icon="navigate-outline"
              iconColor="#f59e0b"
              iconBg="bg-amber-50"
              compact
            />
          </View>
        </View>
      )}

      <View className="mb-4 rounded-2xl border border-gray-100 bg-white p-4">
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-sm font-medium text-gray-900">Enable Travel Fees</Text>
            <Text className="text-xs text-gray-500">Charge for at-home service travel</Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={(v) => update(() => setEnabled(v))}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={enabled ? "#6366f1" : "#f4f4f5"}
          />
        </View>

        {enabled && (
          <>
            <View className="my-2 border-t border-gray-100" />
            <View className="mb-3 flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-sm font-medium text-gray-900">Use Platform Defaults</Text>
                <Text className="text-xs text-gray-500">Use standard platform rates</Text>
              </View>
              <Switch
                value={usePlatformDefault}
                onValueChange={(v) => update(() => setUsePlatformDefault(v))}
                trackColor={{ false: "#d1d5db", true: "#818cf8" }}
                thumbColor={usePlatformDefault ? "#6366f1" : "#f4f4f5"}
              />
            </View>

            {!usePlatformDefault && (
              <>
                <View className="my-2 border-t border-gray-100" />
                <Text className="mb-1 text-sm font-medium text-gray-700">Free Within (km)</Text>
                <TextInput
                  className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                  value={freeWithin}
                  onChangeText={(t) => update(() => setFreeWithin(t))}
                  placeholder="0 (charge from first km)"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                />

                <Text className="mb-1 text-sm font-medium text-gray-700">Rate per km (R)</Text>
                <TextInput
                  className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                  value={ratePerKm}
                  onChangeText={(t) => update(() => setRatePerKm(t))}
                  placeholder="0.00"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                />

                <Text className="mb-1 text-sm font-medium text-gray-700">Minimum Fee (R)</Text>
                <TextInput
                  className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                  value={minimumFee}
                  onChangeText={(t) => update(() => setMinimumFee(t))}
                  placeholder="0.00"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                />

                <Text className="mb-1 text-sm font-medium text-gray-700">Maximum Fee (R, optional)</Text>
                <TextInput
                  className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                  value={maximumFee}
                  onChangeText={(t) => update(() => setMaximumFee(t))}
                  placeholder="No maximum"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                />
              </>
            )}
          </>
        )}
      </View>

      {/* Fee calculator preview */}
      {enabled && !usePlatformDefault && ratePerKm && (
        <View className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
          <Text className="mb-2 text-sm font-semibold text-indigo-900">
            Fee Calculator
          </Text>
          <View className="flex-row items-center gap-2">
            <TextInput
              className="flex-1 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-base text-gray-900"
              value={previewKm}
              onChangeText={setPreviewKm}
              keyboardType="decimal-pad"
              placeholder="Distance (km)"
              placeholderTextColor="#9ca3af"
            />
            <View className="items-center rounded-xl bg-indigo-600 px-4 py-2.5">
              <Text className="text-base font-bold text-white">
                {previewFee !== null ? `R ${previewFee.toFixed(2)}` : "—"}
              </Text>
            </View>
          </View>
          {freeWithin && parseFloat(freeWithin) > 0 && (
            <Text className="mt-2 text-xs text-indigo-600">
              First {freeWithin} km free
            </Text>
          )}
        </View>
      )}

      <ActionButton label="Save Settings" onPress={handleSave} loading={saving} disabled={!dirty} fullWidth />
      <View className="h-8" />
    </ScreenContainer>
  );
}
