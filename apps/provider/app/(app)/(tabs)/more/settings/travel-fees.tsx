import { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, Alert, Switch, TouchableOpacity } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatCard } from "@/components/ui/StatCard";
import { formatCurrency } from "@/lib/format";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { twStyle } from "@/lib/twStyle";

interface TravelFeeTier {
  max_km: number;
  fee: number;
}

interface TravelFeeSettings {
  enabled: boolean;
  rate_per_km: number | null;
  minimum_fee: number | null;
  maximum_fee: number | null;
  free_within_km: number | null;
  currency: string;
  use_platform_default: boolean;
  pricing_model?: "per_km" | "tiered" | null;
  tiers?: TravelFeeTier[] | null;
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
  const [pricingModel, setPricingModel] = useState<"per_km" | "tiered">("per_km");
  const [tiers, setTiers] = useState<TravelFeeTier[]>([]);
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
      setPricingModel(settings.pricing_model === "tiered" ? "tiered" : "per_km");
      setTiers(Array.isArray(settings.tiers) && settings.tiers.length > 0 ? settings.tiers : []);
    }
  }, [settings]);

  function update(fn: () => void) {
    fn();
    setDirty(true);
  }

  const previewFee = useMemo(() => {
    if (usePlatformDefault) return null;
    const km = parseFloat(previewKm) || 0;
    if (pricingModel === "tiered") {
      const sorted = [...tiers].sort((a, b) => a.max_km - b.max_km);
      const tier = sorted.find((t) => km <= t.max_km);
      return tier ? tier.fee : null;
    }
    if (!ratePerKm) return null;
    const freeKm = parseFloat(freeWithin) || 0;
    const chargeableKm = Math.max(0, km - freeKm);
    const rate = parseFloat(ratePerKm) || 0;
    const minFee = parseFloat(minimumFee) || 0;
    const maxFee = parseFloat(maximumFee) || Infinity;
    let fee = chargeableKm * rate;
    fee = Math.max(fee, minFee);
    if (maxFee < Infinity) fee = Math.min(fee, maxFee);
    return fee;
  }, [ratePerKm, minimumFee, maximumFee, freeWithin, previewKm, usePlatformDefault, pricingModel, tiers]);

  async function handleSave() {
    const payload: Record<string, unknown> = {
      enabled,
      use_platform_default: usePlatformDefault,
    };
    if (!usePlatformDefault) {
      payload.pricing_model = pricingModel;
      if (pricingModel === "per_km") {
        payload.rate_per_km = Number(ratePerKm) || 0;
        payload.minimum_fee = Number(minimumFee) || 0;
        payload.maximum_fee = maximumFee ? Number(maximumFee) : null;
        payload.free_within_km = freeWithin ? Number(freeWithin) : null;
      } else {
        if (tiers.length === 0) {
          Alert.alert("Error", "Add at least one distance tier");
          return;
        }
        const sorted = [...tiers].sort((a, b) => a.max_km - b.max_km);
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].max_km <= sorted[i - 1].max_km) {
            Alert.alert("Error", "Tiers must be in ascending order by max km");
            return;
          }
        }
        payload.tiers = sorted;
      }
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
        <View style={twStyle("mb-4 flex-row")}>
          <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
            <StatCard
              title="This Month"
              value={formatCurrency(stats.total_travel_fees_month)}
              icon="car-outline"
              iconColor="#22c55e"
              iconBg="bg-green-50"
              compact
            />
          </View>
          <View style={[twStyle("flex-1"), { marginRight: 8 }]}>
            <StatCard
              title="Avg Fee"
              value={formatCurrency(stats.avg_fee)}
              icon="calculator-outline"
              iconColor="#6366f1"
              iconBg="bg-indigo-50"
              compact
            />
          </View>
          <View style={twStyle("flex-1")}>
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

      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("mb-3 flex-row items-center justify-between")}>
          <View style={twStyle("flex-1")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>Enable Travel Fees</Text>
            <Text style={twStyle("text-xs text-gray-500")}>Charge for at-home service travel</Text>
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
            <View style={twStyle("my-2 border-t border-gray-100")} />
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <View style={twStyle("flex-1")}>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>Use Platform Defaults</Text>
                <Text style={twStyle("text-xs text-gray-500")}>Use standard platform rates</Text>
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
                <View style={twStyle("my-2 border-t border-gray-100")} />
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Pricing model</Text>
                <View style={twStyle("mb-3 flex-row gap-3")}>
                  <TouchableOpacity
                    style={[
                      twStyle("flex-1 rounded-xl border px-4 py-3"),
                      pricingModel === "per_km" ? twStyle("border-indigo-500 bg-indigo-50") : twStyle("border-gray-200 bg-gray-50"),
                    ]}
                    onPress={() => update(() => setPricingModel("per_km"))}
                  >
                    <Text style={twStyle("text-center text-sm font-medium text-gray-900")}>Per km</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      twStyle("flex-1 rounded-xl border px-4 py-3"),
                      pricingModel === "tiered" ? twStyle("border-indigo-500 bg-indigo-50") : twStyle("border-gray-200 bg-gray-50"),
                    ]}
                    onPress={() => update(() => setPricingModel("tiered"))}
                  >
                    <Text style={twStyle("text-center text-sm font-medium text-gray-900")}>Tiers</Text>
                  </TouchableOpacity>
                </View>

                {pricingModel === "per_km" && (
                  <>
                    <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Free Within (km)</Text>
                    <TextInput
                      style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                      value={freeWithin}
                      onChangeText={(t) => update(() => setFreeWithin(t))}
                      placeholder="0 (charge from first km)"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                    />
                    <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{`Rate per km (${getTenantDefaultCurrency()})`}</Text>
                    <TextInput
                      style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                      value={ratePerKm}
                      onChangeText={(t) => update(() => setRatePerKm(t))}
                      placeholder="0.00"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                    />
                    <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{`Minimum Fee (${getTenantDefaultCurrency()})`}</Text>
                    <TextInput
                      style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                      value={minimumFee}
                      onChangeText={(t) => update(() => setMinimumFee(t))}
                      placeholder="0.00"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                    />
                    <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{`Maximum Fee (${getTenantDefaultCurrency()}, optional)`}</Text>
                    <TextInput
                      style={twStyle("mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900")}
                      value={maximumFee}
                      onChangeText={(t) => update(() => setMaximumFee(t))}
                      placeholder="No maximum"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                    />
                  </>
                )}

                {pricingModel === "tiered" && (
                  <View style={twStyle("mb-3")}>
                    <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{`Distance tiers (up to X km → fee in ${getTenantDefaultCurrency()})`}</Text>
                    {tiers.map((tier, i) => (
                      <View key={i} style={twStyle("mb-2 flex-row items-center gap-2")}>
                        <TextInput
                          style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900"), { minWidth: 60 }]}
                          value={String(tier.max_km)}
                          onChangeText={(t) => {
                            const n = parseInt(t, 10) || 0;
                            update(() => setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, max_km: n } : x))));
                          }}
                          placeholder="km"
                          placeholderTextColor="#9ca3af"
                          keyboardType="number-pad"
                        />
                        <Text style={twStyle("text-sm text-gray-500")}>km =</Text>
                        <TextInput
                          style={[twStyle("flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900"), { minWidth: 60 }]}
                          value={String(tier.fee)}
                          onChangeText={(t) => {
                            const n = parseFloat(t) || 0;
                            update(() => setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, fee: n } : x))));
                          }}
                          placeholder={getTenantDefaultCurrency()}
                          placeholderTextColor="#9ca3af"
                          keyboardType="decimal-pad"
                        />
                        <TouchableOpacity
                          onPress={() => update(() => setTiers((prev) => prev.filter((_, j) => j !== i)))}
                          style={twStyle("rounded-full bg-gray-200 p-2")}
                          accessibilityLabel="Remove tier"
                        >
                          <Ionicons name="trash-outline" size={18} color="#6b7280" />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={twStyle("flex-row items-center rounded-xl border border-dashed border-gray-300 py-2.5")}
                      onPress={() => update(() => setTiers((prev) => [...prev, { max_km: prev.length ? (prev[prev.length - 1].max_km + 10) : 10, fee: 100 }]))}
                    >
                      <Ionicons name="add-circle-outline" size={20} color="#6366f1" style={{ marginLeft: 12, marginRight: 6 }} />
                      <Text style={twStyle("text-sm font-medium text-indigo-600")}>Add tier</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </View>

      {/* Fee calculator preview */}
      {enabled && !usePlatformDefault && (pricingModel === "per_km" ? ratePerKm : tiers.length > 0) && (
        <View style={twStyle("mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4")}>
          <Text style={twStyle("mb-2 text-sm font-semibold text-indigo-900")}>
            Fee Calculator
          </Text>
          <View style={twStyle("flex-row items-center")}>
            <TextInput
              style={[twStyle("flex-1 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-base text-gray-900"), { marginRight: 8 }]}
              value={previewKm}
              onChangeText={setPreviewKm}
              keyboardType="decimal-pad"
              placeholder="Distance (km)"
              placeholderTextColor="#9ca3af"
            />
            <View style={twStyle("items-center rounded-xl bg-indigo-600 px-4 py-2.5")}>
              <Text style={twStyle("text-base font-bold text-white")}>
                {previewFee !== null ? formatCurrency(previewFee) : "—"}
              </Text>
            </View>
          </View>
          {freeWithin && parseFloat(freeWithin) > 0 && (
            <Text style={twStyle("mt-2 text-xs text-indigo-600")}>
              First {freeWithin} km free
            </Text>
          )}
        </View>
      )}

      <ActionButton label="Save Settings" onPress={handleSave} loading={saving} disabled={!dirty} fullWidth />
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
