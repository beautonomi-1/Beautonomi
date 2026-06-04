import { useState, useEffect } from "react";
import { View, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useApi, useApiMutation } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ActionButton } from "@/components/ui/ActionButton";
import { LoadingState } from "@/components/ui/LoadingState";
import { StatCard } from "@/components/ui/StatCard";
import { formatCurrency } from "@/lib/format";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { twStyle } from "@/lib/twStyle";
import {
  TravelFeesEditor,
  type PlatformTravelLimits,
} from "@/features/travel-fees/TravelFeesEditor";
import type { OnboardingTravelFees } from "@/features/provider-onboarding/types";

interface TravelFeeSettings {
  enabled: boolean;
  rate_per_km: number | null;
  minimum_fee: number | null;
  maximum_fee: number | null;
  free_within_km: number | null;
  currency: string;
  use_platform_default: boolean;
  pricing_model?: "per_km" | "tiered" | null;
  tiers?: { max_km: number; fee: number }[] | null;
  allow_provider_customization?: boolean;
  stats?: {
    total_travel_fees_month: number;
    avg_fee: number;
    total_trips: number;
  };
}

function settingsToEditorValue(s: TravelFeeSettings): OnboardingTravelFees {
  return {
    enabled: s.enabled,
    use_platform_default: s.use_platform_default,
    pricing_model: s.pricing_model === "tiered" ? "tiered" : "per_km",
    rate_per_km: s.rate_per_km,
    minimum_fee: s.minimum_fee,
    maximum_fee: s.maximum_fee,
    free_within_km: s.free_within_km,
    tiers: Array.isArray(s.tiers) && s.tiers.length > 0 ? s.tiers : [],
  };
}

export default function TravelFeesScreen() {
  const { data: settings, loading, refresh } = useApi<TravelFeeSettings>("/api/provider/travel-fees");
  const { data: platformLimits } = useApi<PlatformTravelLimits>(
    "/api/provider/travel-fees/platform-limits",
  );
  const { execute: saveSettings, loading: saving } = useApiMutation("patch");

  const [value, setValue] = useState<OnboardingTravelFees>({
    enabled: true,
    use_platform_default: true,
    pricing_model: "per_km",
    tiers: [],
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setValue(settingsToEditorValue(settings));
      setDirty(false);
    }
  }, [settings]);

  const allowCustomization =
    platformLimits?.allow_provider_customization !== false &&
    settings?.allow_provider_customization !== false;
  const allowTiered = platformLimits?.allow_provider_tiered !== false;
  const currency = settings?.currency ?? getTenantDefaultCurrency();

  function handleChange(patch: Partial<OnboardingTravelFees>) {
    setValue((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  async function handleSave() {
    const usePlatformDefault = value.use_platform_default !== false;
    const pricingModel = value.pricing_model === "tiered" ? "tiered" : "per_km";

    if (!usePlatformDefault && platformLimits) {
      const r = value.rate_per_km ?? 0;
      const m = value.minimum_fee ?? 0;
      if (pricingModel === "per_km") {
        if (r < platformLimits.provider_min_rate_per_km || r > platformLimits.provider_max_rate_per_km) {
          Alert.alert(
            "Error",
            `Rate per km must be between ${platformLimits.provider_min_rate_per_km} and ${platformLimits.provider_max_rate_per_km}`,
          );
          return;
        }
        if (m < platformLimits.provider_min_minimum_fee || m > platformLimits.provider_max_minimum_fee) {
          Alert.alert(
            "Error",
            `Minimum fee must be between ${platformLimits.provider_min_minimum_fee} and ${platformLimits.provider_max_minimum_fee}`,
          );
          return;
        }
      }
    }

    const payload: Record<string, unknown> = {
      enabled: value.enabled !== false,
      use_platform_default: usePlatformDefault,
      currency,
    };
    if (!usePlatformDefault) {
      payload.pricing_model = pricingModel;
      if (pricingModel === "per_km") {
        payload.rate_per_km = value.rate_per_km ?? 0;
        payload.minimum_fee = value.minimum_fee ?? 0;
        payload.maximum_fee = value.maximum_fee;
        payload.free_within_km = value.free_within_km;
      } else {
        if (!allowTiered) {
          Alert.alert("Error", "Tiered pricing is not enabled for your platform.");
          return;
        }
        const tiers = value.tiers ?? [];
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

      <TravelFeesEditor
        value={value}
        onChange={handleChange}
        platformLimits={platformLimits ?? null}
        currency={currency}
        mode="settings"
        providerCustomizationAllowed={allowCustomization}
      />

      <ActionButton label="Save Settings" onPress={handleSave} loading={saving} disabled={!dirty} fullWidth />
      <View style={twStyle("h-8")} />
    </ScreenContainer>
  );
}
