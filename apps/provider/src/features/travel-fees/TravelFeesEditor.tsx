import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { View, Text, TextInput, Switch, TouchableOpacity } from "react-native";
import { KeyboardDoneAccessory } from "@/features/provider-onboarding/KeyboardDoneAccessory";
import { Ionicons } from "@expo/vector-icons";
import { roundCurrency } from "@beautonomi/utils";
import { formatCurrency } from "@/lib/format";
import { twStyle } from "@/lib/twStyle";
import type { OnboardingTravelFees, OnboardingTravelFeeTier } from "@/features/provider-onboarding/types";

export interface PlatformTravelLimits {
  provider_min_rate_per_km: number;
  provider_max_rate_per_km: number;
  provider_min_minimum_fee: number;
  provider_max_minimum_fee: number;
  allow_provider_customization: boolean;
  allow_provider_tiered: boolean;
  default_free_within_km?: number;
}

export type TravelFeesEditorMode = "settings" | "onboarding";

export interface TravelFeesEditorProps {
  value: OnboardingTravelFees;
  onChange: (patch: Partial<OnboardingTravelFees>) => void;
  platformLimits: PlatformTravelLimits | null;
  currency: string;
  mode: TravelFeesEditorMode;
  /** When false, provider-level customization is blocked (e.g. tenant policy). Defaults true. */
  providerCustomizationAllowed?: boolean;
  /** Scroll focused field into view (e.g. onboarding wizard). */
  onFieldFocus?: (inputRef: RefObject<TextInput | null>) => void;
}

function numStr(n: number | null | undefined): string {
  return n != null ? String(n) : "";
}

function toNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatTravelFeesSummary(
  tf: OnboardingTravelFees | undefined,
  currency: string,
): string {
  if (!tf || tf.enabled === false) return "Disabled";
  if (tf.use_platform_default !== false) return "Platform defaults";
  const model = tf.pricing_model === "tiered" ? "tiered" : "per_km";
  if (model === "tiered") {
    const count = tf.tiers?.length ?? 0;
    return count > 0 ? `${count} distance tier${count === 1 ? "" : "s"}` : "Custom tiers (incomplete)";
  }
  const rate = tf.rate_per_km;
  const min = tf.minimum_fee;
  const parts: string[] = [];
  if (rate != null) parts.push(`${formatCurrency(rate, currency)}/km`);
  if (min != null) parts.push(`min ${formatCurrency(min, currency)}`);
  if (tf.free_within_km != null && tf.free_within_km > 0) {
    parts.push(`free ≤ ${tf.free_within_km} km`);
  }
  if (tf.maximum_fee != null) parts.push(`max ${formatCurrency(tf.maximum_fee, currency)}`);
  return parts.length > 0 ? parts.join(" · ") : "Custom per-km (incomplete)";
}

const TRAVEL_FEES_ACCESSORY = {
  freeKm: "provider-travel-free-km",
  rate: "provider-travel-rate",
  minFee: "provider-travel-min-fee",
  maxFee: "provider-travel-max-fee",
  previewKm: "provider-travel-preview-km",
} as const;

export function TravelFeesEditor({
  value,
  onChange,
  platformLimits,
  currency,
  mode,
  providerCustomizationAllowed = true,
  onFieldFocus,
}: TravelFeesEditorProps) {
  const [previewKm, setPreviewKm] = useState("10");
  const freeKmRef = useRef<TextInput>(null);
  const rateRef = useRef<TextInput>(null);
  const minFeeRef = useRef<TextInput>(null);
  const maxFeeRef = useRef<TextInput>(null);
  const previewKmRef = useRef<TextInput>(null);

  const focusProps = (ref: RefObject<TextInput | null>, accessoryId?: string) => ({
    onFocus: () => onFieldFocus?.(ref),
    ...(accessoryId ? { inputAccessoryViewID: accessoryId } : {}),
  });

  const allowCustomization =
    providerCustomizationAllowed &&
    (platformLimits ? platformLimits.allow_provider_customization !== false : true);
  const allowTiered = platformLimits ? platformLimits.allow_provider_tiered !== false : true;

  const enabled = value.enabled !== false;
  const usePlatformDefault = allowCustomization ? value.use_platform_default !== false : true;
  const pricingModel: "per_km" | "tiered" =
    value.pricing_model === "tiered" ? "tiered" : "per_km";
  const tiers = value.tiers ?? [];

  const set = (patch: Partial<OnboardingTravelFees>) => onChange(patch);

  useEffect(() => {
    if (!allowCustomization && value.use_platform_default === false) {
      onChange({ use_platform_default: true });
    }
  }, [allowCustomization, value.use_platform_default, onChange]);

  useEffect(() => {
    if (!allowTiered && value.pricing_model === "tiered") {
      onChange({ pricing_model: "per_km" });
    }
  }, [allowTiered, value.pricing_model, onChange]);

  const rate = value.rate_per_km ?? 0;
  const minFee = value.minimum_fee ?? 0;

  const rateHint = useMemo(() => {
    if (usePlatformDefault || pricingModel !== "per_km" || !platformLimits) return null;
    if (rate < platformLimits.provider_min_rate_per_km) {
      return `Min ${platformLimits.provider_min_rate_per_km} per km`;
    }
    if (rate > platformLimits.provider_max_rate_per_km) {
      return `Max ${platformLimits.provider_max_rate_per_km} per km`;
    }
    return null;
  }, [usePlatformDefault, pricingModel, platformLimits, rate]);

  const minFeeHint = useMemo(() => {
    if (usePlatformDefault || pricingModel !== "per_km" || !platformLimits) return null;
    if (minFee < platformLimits.provider_min_minimum_fee) {
      return `Min fee from ${platformLimits.provider_min_minimum_fee}`;
    }
    if (minFee > platformLimits.provider_max_minimum_fee) {
      return `Max fee ${platformLimits.provider_max_minimum_fee}`;
    }
    return null;
  }, [usePlatformDefault, pricingModel, platformLimits, minFee]);

  const previewFee = useMemo(() => {
    if (usePlatformDefault) return null;
    const km = parseFloat(previewKm) || 0;
    if (pricingModel === "tiered") {
      const sorted = [...tiers].sort((a, b) => a.max_km - b.max_km);
      const tier = sorted.find((t) => km <= t.max_km);
      return tier ? tier.fee : null;
    }
    const r = value.rate_per_km;
    if (r == null) return null;
    const freeKm = value.free_within_km ?? 0;
    if (freeKm > 0 && km <= freeKm) return 0;
    const min = value.minimum_fee ?? 0;
    const maxFee =
      value.maximum_fee != null && Number.isFinite(value.maximum_fee)
        ? value.maximum_fee
        : Infinity;
    let totalFee = min + Math.max(0, km - freeKm) * r;
    if (Number.isFinite(maxFee)) totalFee = Math.min(totalFee, maxFee);
    return roundCurrency(totalFee);
  }, [value, previewKm, usePlatformDefault, pricingModel, tiers]);

  const showCalculator =
    enabled &&
    !usePlatformDefault &&
    (pricingModel === "per_km" ? value.rate_per_km != null : tiers.length > 0);

  return (
    <>
      {mode === "onboarding" && (
        <View style={twStyle("mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4")}>
          <Text style={twStyle("text-[15px] leading-relaxed text-indigo-900")}>
            Set how you charge customers for travelling to at-home appointments. Keep the platform
            default to start earning instantly — you can fine-tune this any time from Settings.
          </Text>
        </View>
      )}

      {allowCustomization === false && (
        <View style={twStyle("mb-4 rounded-2xl border border-amber-100 bg-amber-50 p-3")}>
          <Text style={twStyle("text-sm text-amber-900")}>
            Travel rates are set by your platform. You can turn travel fees on or off; per-km and
            tier customization is disabled.
          </Text>
        </View>
      )}

      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("mb-3 flex-row items-center justify-between")}>
          <View style={twStyle("flex-1 pr-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>
              {mode === "onboarding" ? "Enable travel fees" : "Enable Travel Fees"}
            </Text>
            <Text style={twStyle("text-xs text-gray-500")}>Charge for at-home service travel</Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={(v) => set({ enabled: v })}
            trackColor={{ false: "#d1d5db", true: "#818cf8" }}
            thumbColor={enabled ? "#6366f1" : "#f4f4f5"}
          />
        </View>

        {enabled && (
          <>
            <View style={twStyle("my-2 border-t border-gray-100")} />
            <View style={twStyle("mb-3 flex-row items-center justify-between")}>
              <View style={twStyle("flex-1 pr-3")}>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>
                  {mode === "onboarding" ? "Use platform defaults" : "Use Platform Defaults"}
                </Text>
                <Text style={twStyle("text-xs text-gray-500")}>Use standard platform rates</Text>
              </View>
              <Switch
                value={usePlatformDefault}
                disabled={!allowCustomization}
                onValueChange={(v) => {
                  if (!allowCustomization) return;
                  set({ use_platform_default: v });
                }}
                trackColor={{ false: "#d1d5db", true: "#818cf8" }}
                thumbColor={usePlatformDefault ? "#6366f1" : "#f4f4f5"}
              />
            </View>

            {!usePlatformDefault && allowCustomization && (
              <>
                <View style={twStyle("my-2 border-t border-gray-100")} />
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>Pricing model</Text>
                <View style={twStyle("mb-3 flex-row gap-3")}>
                  <TouchableOpacity
                    style={[
                      twStyle("flex-1 rounded-xl border px-4 py-3"),
                      pricingModel === "per_km"
                        ? twStyle("border-indigo-500 bg-indigo-50")
                        : twStyle("border-gray-200 bg-gray-50"),
                    ]}
                    onPress={() => set({ pricing_model: "per_km" })}
                    accessibilityRole="button"
                    accessibilityLabel="Per km travel pricing"
                    accessibilityState={{ selected: pricingModel === "per_km" }}
                  >
                    <Text style={twStyle("text-center text-sm font-medium text-gray-900")}>Per km</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      twStyle("flex-1 rounded-xl border px-4 py-3"),
                      pricingModel === "tiered"
                        ? twStyle("border-indigo-500 bg-indigo-50")
                        : twStyle("border-gray-200 bg-gray-50"),
                      !allowTiered ? twStyle("opacity-40") : undefined,
                    ]}
                    disabled={!allowTiered}
                    onPress={() => {
                      if (!allowTiered) return;
                      set({
                        pricing_model: "tiered",
                        tiers: tiers.length ? tiers : [{ max_km: 10, fee: 100 }],
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Tiered distance pricing"
                    accessibilityState={{ selected: pricingModel === "tiered", disabled: !allowTiered }}
                  >
                    <Text style={twStyle("text-center text-sm font-medium text-gray-900")}>Tiers</Text>
                  </TouchableOpacity>
                </View>

                {pricingModel === "per_km" && (
                  <>
                    <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                      {mode === "onboarding" ? "Free within (km)" : "Free Within (km)"}
                    </Text>
                    <TextInput
                      ref={freeKmRef}
                      style={twStyle(
                        "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900",
                      )}
                      value={numStr(value.free_within_km)}
                      onChangeText={(t) => set({ free_within_km: toNum(t) })}
                      placeholder="0 (charge from first km)"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                      {...focusProps(freeKmRef, TRAVEL_FEES_ACCESSORY.freeKm)}
                    />
                    <KeyboardDoneAccessory nativeID={TRAVEL_FEES_ACCESSORY.freeKm} />
                    <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                      {`Rate per km (${currency})`}
                    </Text>
                    <TextInput
                      ref={rateRef}
                      style={twStyle(
                        "mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900",
                      )}
                      value={numStr(value.rate_per_km)}
                      onChangeText={(t) => set({ rate_per_km: toNum(t) })}
                      placeholder="0.00"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                      {...focusProps(rateRef, TRAVEL_FEES_ACCESSORY.rate)}
                    />
                    <KeyboardDoneAccessory nativeID={TRAVEL_FEES_ACCESSORY.rate} />
                    {rateHint ? (
                      <Text style={twStyle("mb-3 text-xs text-amber-700")}>{rateHint}</Text>
                    ) : (
                      <View style={twStyle("mb-3")} />
                    )}
                    <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                      {`Minimum fee (${currency})`}
                    </Text>
                    <TextInput
                      ref={minFeeRef}
                      style={twStyle(
                        "mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900",
                      )}
                      value={numStr(value.minimum_fee)}
                      onChangeText={(t) => set({ minimum_fee: toNum(t) })}
                      placeholder="0.00"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                      {...focusProps(minFeeRef, TRAVEL_FEES_ACCESSORY.minFee)}
                    />
                    <KeyboardDoneAccessory nativeID={TRAVEL_FEES_ACCESSORY.minFee} />
                    {minFeeHint ? (
                      <Text style={twStyle("mb-3 text-xs text-amber-700")}>{minFeeHint}</Text>
                    ) : (
                      <View style={twStyle("mb-3")} />
                    )}
                    <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                      {`Maximum fee (${currency}, optional)`}
                    </Text>
                    <TextInput
                      ref={maxFeeRef}
                      style={twStyle(
                        "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900",
                      )}
                      value={numStr(value.maximum_fee)}
                      onChangeText={(t) => set({ maximum_fee: toNum(t) })}
                      placeholder="No maximum"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                      {...focusProps(maxFeeRef, TRAVEL_FEES_ACCESSORY.maxFee)}
                    />
                    <KeyboardDoneAccessory nativeID={TRAVEL_FEES_ACCESSORY.maxFee} />
                  </>
                )}

                {pricingModel === "tiered" && (
                  <TierEditor
                    tiers={tiers}
                    currency={currency}
                    onChange={(next) => set({ tiers: next })}
                    onFieldFocus={onFieldFocus}
                  />
                )}
              </>
            )}
          </>
        )}
      </View>

      {showCalculator && (
        <View style={twStyle("mb-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-4")}>
          <Text style={twStyle("mb-2 text-sm font-semibold text-indigo-900")}>Fee Calculator</Text>
          <View style={twStyle("flex-row items-center")}>
            <TextInput
              ref={previewKmRef}
              style={[
                twStyle(
                  "flex-1 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-base text-gray-900",
                ),
                { marginRight: 8 },
              ]}
              value={previewKm}
              onChangeText={setPreviewKm}
              keyboardType="decimal-pad"
              placeholder="Distance (km)"
              placeholderTextColor="#9ca3af"
              {...focusProps(previewKmRef, TRAVEL_FEES_ACCESSORY.previewKm)}
            />
            <KeyboardDoneAccessory nativeID={TRAVEL_FEES_ACCESSORY.previewKm} />
            <View style={twStyle("items-center rounded-xl bg-indigo-600 px-4 py-2.5")}>
              <Text style={twStyle("text-base font-bold text-white")}>
                {previewFee !== null ? formatCurrency(previewFee, currency) : "—"}
              </Text>
            </View>
          </View>
          {value.free_within_km != null && value.free_within_km > 0 && pricingModel === "per_km" && (
            <Text style={twStyle("mt-2 text-xs text-indigo-600")}>
              First {value.free_within_km} km free
            </Text>
          )}
        </View>
      )}
    </>
  );
}

function TierEditor({
  tiers,
  currency,
  onChange,
  onFieldFocus,
}: {
  tiers: OnboardingTravelFeeTier[];
  currency: string;
  onChange: (tiers: OnboardingTravelFeeTier[]) => void;
  onFieldFocus?: (inputRef: RefObject<TextInput | null>) => void;
}) {
  const tierKmRefs = useRef<Map<number, TextInput | null>>(new Map());
  const tierFeeRefs = useRef<Map<number, TextInput | null>>(new Map());

  return (
    <View style={twStyle("mb-3")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
        {`Distance tiers (up to X km → fee in ${currency})`}
      </Text>
      {tiers.map((tier, i) => {
        const kmAccessory = `provider-travel-tier-km-${i}`;
        const feeAccessory = `provider-travel-tier-fee-${i}`;
        return (
        <View key={i} style={twStyle("mb-2 flex-row items-center gap-2")}>
          <TextInput
            ref={(r) => {
              tierKmRefs.current.set(i, r);
            }}
            style={[
              twStyle(
                "flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900",
              ),
              { minWidth: 60 },
            ]}
            value={String(tier.max_km)}
            onChangeText={(t) => {
              const n = parseInt(t, 10) || 0;
              onChange(tiers.map((x, j) => (j === i ? { ...x, max_km: n } : x)));
            }}
            placeholder="km"
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            onFocus={() => {
              const ref = { current: tierKmRefs.current.get(i) ?? null };
              onFieldFocus?.(ref);
            }}
            inputAccessoryViewID={kmAccessory}
          />
          <KeyboardDoneAccessory nativeID={kmAccessory} />
          <Text style={twStyle("text-sm text-gray-500")}>km =</Text>
          <TextInput
            ref={(r) => {
              tierFeeRefs.current.set(i, r);
            }}
            style={[
              twStyle(
                "flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900",
              ),
              { minWidth: 60 },
            ]}
            value={String(tier.fee)}
            onChangeText={(t) => {
              const n = parseFloat(t) || 0;
              onChange(tiers.map((x, j) => (j === i ? { ...x, fee: n } : x)));
            }}
            placeholder={currency}
            placeholderTextColor="#9ca3af"
            keyboardType="decimal-pad"
            onFocus={() => {
              const ref = { current: tierFeeRefs.current.get(i) ?? null };
              onFieldFocus?.(ref);
            }}
            inputAccessoryViewID={feeAccessory}
          />
          <KeyboardDoneAccessory nativeID={feeAccessory} />
          <TouchableOpacity
            onPress={() => onChange(tiers.filter((_, j) => j !== i))}
            style={twStyle("rounded-full bg-gray-200 p-2")}
            accessibilityLabel="Remove tier"
          >
            <Ionicons name="trash-outline" size={18} color="#6b7280" />
          </TouchableOpacity>
        </View>
        );
      })}
      <TouchableOpacity
        style={twStyle("flex-row items-center rounded-xl border border-dashed border-gray-300 py-2.5")}
        onPress={() =>
          onChange([
            ...tiers,
            { max_km: tiers.length ? tiers[tiers.length - 1].max_km + 10 : 10, fee: 100 },
          ])
        }
      >
        <Ionicons
          name="add-circle-outline"
          size={20}
          color="#6366f1"
          style={{ marginLeft: 12, marginRight: 6 }}
        />
        <Text style={twStyle("text-sm font-medium text-indigo-600")}>Add tier</Text>
      </TouchableOpacity>
    </View>
  );
}
