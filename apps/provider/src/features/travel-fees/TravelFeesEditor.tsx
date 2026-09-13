import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { View, Text, TextInput, Switch, TouchableOpacity } from "react-native";
import { KeyboardDoneAccessory } from "@/features/provider-onboarding/KeyboardDoneAccessory";
import { Ionicons } from "@expo/vector-icons";
import { roundCurrency } from "@beautonomi/utils";
import { i18n, useTranslation } from "@beautonomi/i18n";
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
  default_rate_per_km?: number;
  default_minimum_fee?: number;
  default_maximum_fee?: number | null;
  default_currency?: string;
  pricing_model?: string;
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
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function tft(key: string, opts?: Record<string, unknown>, fallback?: string): string {
  return i18n.t(`provider.mobile.screens.travelFeesEditor.${key}`, {
    ...(opts ?? {}),
    defaultValue: fallback ?? "",
  }) as string;
}

export function formatTravelFeesSummary(
  tf: OnboardingTravelFees | undefined,
  currency: string,
): string {
  if (!tf || tf.enabled === false) return tft("summaryDisabled", undefined, "Disabled");
  if (tf.use_platform_default !== false) return tft("summaryPlatformDefaults", undefined, "Platform defaults");
  const model = tf.pricing_model === "tiered" ? "tiered" : "per_km";
  if (model === "tiered") {
    const count = tf.tiers?.length ?? 0;
    return count > 0
      ? tft("summaryTierCount", { count }, count === 1 ? `${count} distance tier` : `${count} distance tiers`)
      : tft("summaryTiersIncomplete", undefined, "Custom tiers (incomplete)");
  }
  const rate = tf.rate_per_km;
  const min = tf.minimum_fee;
  const parts: string[] = [];
  if (rate != null) parts.push(tft("summaryRateKm", { amount: formatCurrency(rate, currency) }, `${formatCurrency(rate, currency)}/km`));
  if (min != null) parts.push(tft("summaryMin", { amount: formatCurrency(min, currency) }, `min ${formatCurrency(min, currency)}`));
  if (tf.free_within_km != null && tf.free_within_km > 0) {
    parts.push(tft("summaryFreeLe", { km: tf.free_within_km }, `free ≤ ${tf.free_within_km} km`));
  }
  if (tf.maximum_fee != null) parts.push(tft("summaryMax", { amount: formatCurrency(tf.maximum_fee, currency) }, `max ${formatCurrency(tf.maximum_fee, currency)}`));
  return parts.length > 0 ? parts.join(" · ") : tft("summaryPerKmIncomplete", undefined, "Custom per-km (incomplete)");
}

export function formatPlatformTravelDefaultsSummary(
  limits: PlatformTravelLimits | null | undefined,
  currency: string,
): string | null {
  if (!limits) return null;
  const cur = limits.default_currency?.trim() || currency;
  const parts: string[] = [];
  if (limits.default_rate_per_km != null && Number.isFinite(limits.default_rate_per_km)) {
    parts.push(tft("summaryRateKm", { amount: formatCurrency(limits.default_rate_per_km, cur) }, `${formatCurrency(limits.default_rate_per_km, cur)}/km`));
  }
  if (limits.default_minimum_fee != null && Number.isFinite(limits.default_minimum_fee)) {
    parts.push(tft("summaryMin", { amount: formatCurrency(limits.default_minimum_fee, cur) }, `min ${formatCurrency(limits.default_minimum_fee, cur)}`));
  }
  const freeKm = limits.default_free_within_km;
  if (freeKm != null && freeKm > 0) {
    parts.push(tft("summaryFreeWithin", { km: freeKm }, `free within ${freeKm} km`));
  } else if (freeKm === 0) {
    parts.push(tft("summaryChargedFromFirst", undefined, "charged from first km"));
  }
  if (limits.default_maximum_fee != null && Number.isFinite(limits.default_maximum_fee)) {
    parts.push(tft("summaryMax", { amount: formatCurrency(limits.default_maximum_fee, cur) }, `max ${formatCurrency(limits.default_maximum_fee, cur)}`));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
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
  const { t } = useTranslation();
  const tf = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.travelFeesEditor.${key}`, {
      defaultValue:
        key === "perKmA11y"
          ? "Per km travel pricing"
          : key === "tieredA11y"
            ? "Tiered distance pricing"
            : undefined,
      ...(opts ?? {}),
    }) as string;
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
      return tf("rateMin", { amount: platformLimits.provider_min_rate_per_km });
    }
    if (rate > platformLimits.provider_max_rate_per_km) {
      return tf("rateMax", { amount: platformLimits.provider_max_rate_per_km });
    }
    return null;
  }, [usePlatformDefault, pricingModel, platformLimits, rate, tf]);

  const minFeeHint = useMemo(() => {
    if (usePlatformDefault || pricingModel !== "per_km" || !platformLimits) return null;
    if (minFee < platformLimits.provider_min_minimum_fee) {
      return tf("minFeeFrom", { amount: platformLimits.provider_min_minimum_fee });
    }
    if (minFee > platformLimits.provider_max_minimum_fee) {
      return tf("maxFee", { amount: platformLimits.provider_max_minimum_fee });
    }
    return null;
  }, [usePlatformDefault, pricingModel, platformLimits, minFee, tf]);

  const previewFee = useMemo(() => {
    if (usePlatformDefault) return null;
    const km = parseFloat(previewKm) || 0;
    if (pricingModel === "tiered") {
      const sorted = [...tiers].sort((a, b) => a.max_km - b.max_km);
      const tier = sorted.find((item) => km <= item.max_km);
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
            {tf("onboardingIntro")}
          </Text>
        </View>
      )}

      {allowCustomization === false && (
        <View style={twStyle("mb-4 rounded-2xl border border-amber-100 bg-amber-50 p-3")}>
          <Text style={twStyle("text-sm text-amber-900")}>
            {tf("platformLocked")}
          </Text>
        </View>
      )}

      <View style={twStyle("mb-4 rounded-2xl border border-gray-100 bg-white p-4")}>
        <View style={twStyle("mb-3 flex-row items-center justify-between")}>
          <View style={twStyle("flex-1 pe-3")}>
            <Text style={twStyle("text-sm font-medium text-gray-900")}>
              {mode === "onboarding" ? tf("enableOnboarding") : tf("enableSettings")}
            </Text>
            <Text style={twStyle("text-xs text-gray-500")}>{tf("enableHint")}</Text>
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
              <View style={twStyle("flex-1 pe-3")}>
                <Text style={twStyle("text-sm font-medium text-gray-900")}>
                  {mode === "onboarding" ? tf("useDefaultsOnboarding") : tf("useDefaultsSettings")}
                </Text>
                <Text style={twStyle("text-xs text-gray-500")}>{tf("useDefaultsHint")}</Text>
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

            {usePlatformDefault ? (
              <View
                style={twStyle(
                  "mb-3 rounded-xl border border-indigo-100 bg-indigo-50/80 px-4 py-3",
                )}
              >
                <Text style={twStyle("text-xs font-semibold uppercase tracking-wide text-indigo-700")}>
                  {tf("platformStandard")}
                </Text>
                <Text style={twStyle("mt-1 text-sm text-gray-800")}>
                  {formatPlatformTravelDefaultsSummary(platformLimits, currency) ??
                    tf("loadingRates")}
                </Text>
                <Text style={twStyle("mt-1 text-xs text-gray-500")}>
                  {tf("customizeLater")}
                </Text>
              </View>
            ) : null}

            {!usePlatformDefault && allowCustomization && (
              <>
                <View style={twStyle("my-2 border-t border-gray-100")} />
                <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>{tf("pricingModel")}</Text>
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
                    accessibilityLabel={tf("perKmA11y")}
                    accessibilityState={{ selected: pricingModel === "per_km" }}
                  >
                    <Text style={twStyle("text-center text-sm font-medium text-gray-900")}>{tf("perKm")}</Text>
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
                    accessibilityLabel={tf("tieredA11y")}
                    accessibilityState={{ selected: pricingModel === "tiered", disabled: !allowTiered }}
                  >
                    <Text style={twStyle("text-center text-sm font-medium text-gray-900")}>{tf("tiers")}</Text>
                  </TouchableOpacity>
                </View>

                {pricingModel === "per_km" && (
                  <>
                    <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                      {mode === "onboarding" ? tf("freeWithinOnboarding") : tf("freeWithinSettings")}
                    </Text>
                    <TextInput
                      ref={freeKmRef}
                      style={twStyle(
                        "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900",
                      )}
                      value={numStr(value.free_within_km)}
                      onChangeText={(text) => set({ free_within_km: toNum(text) })}
                      placeholder={tf("freeWithinPlaceholder")}
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                      {...focusProps(freeKmRef, TRAVEL_FEES_ACCESSORY.freeKm)}
                    />
                    <KeyboardDoneAccessory nativeID={TRAVEL_FEES_ACCESSORY.freeKm} />
                    <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
                      {tf("ratePerKm", { currency })}
                    </Text>
                    <TextInput
                      ref={rateRef}
                      style={twStyle(
                        "mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900",
                      )}
                      value={numStr(value.rate_per_km)}
                      onChangeText={(text) => set({ rate_per_km: toNum(text) })}
                      placeholder={tf("moneyPlaceholder")}
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
                      {tf("minimumFee", { currency })}
                    </Text>
                    <TextInput
                      ref={minFeeRef}
                      style={twStyle(
                        "mb-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900",
                      )}
                      value={numStr(value.minimum_fee)}
                      onChangeText={(text) => set({ minimum_fee: toNum(text) })}
                      placeholder={tf("moneyPlaceholder")}
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
                      {tf("maximumFee", { currency })}
                    </Text>
                    <TextInput
                      ref={maxFeeRef}
                      style={twStyle(
                        "mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900",
                      )}
                      value={numStr(value.maximum_fee)}
                      onChangeText={(text) => set({ maximum_fee: toNum(text) })}
                      placeholder={tf("noMaximum")}
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
          <Text style={twStyle("mb-2 text-sm font-semibold text-indigo-900")}>{tf("feeCalculator")}</Text>
          <View style={twStyle("flex-row items-center")}>
            <TextInput
              ref={previewKmRef}
              style={[
                twStyle(
                  "flex-1 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-base text-gray-900",
                ),
                { marginEnd: 8 },
              ]}
              value={previewKm}
              onChangeText={setPreviewKm}
              keyboardType="decimal-pad"
              placeholder={tf("distancePlaceholder")}
              placeholderTextColor="#9ca3af"
              {...focusProps(previewKmRef, TRAVEL_FEES_ACCESSORY.previewKm)}
            />
            <KeyboardDoneAccessory nativeID={TRAVEL_FEES_ACCESSORY.previewKm} />
            <View style={twStyle("items-center rounded-xl bg-indigo-600 px-4 py-2.5")}>
              <Text style={twStyle("text-base font-bold text-white")}>
                {previewFee !== null ? formatCurrency(previewFee, currency) : tf("emptyValue")}
              </Text>
            </View>
          </View>
          {value.free_within_km != null && value.free_within_km > 0 && pricingModel === "per_km" && (
            <Text style={twStyle("mt-2 text-xs text-indigo-600")}>
              {tf("firstKmFree", { km: value.free_within_km })}
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
  const { t } = useTranslation();
  const tf = (key: string, opts?: Record<string, unknown>) =>
    t(`provider.mobile.screens.travelFeesEditor.${key}`, opts) as string;
  const tierKmRefs = useRef<Map<number, TextInput | null>>(new Map());
  const tierFeeRefs = useRef<Map<number, TextInput | null>>(new Map());

  return (
    <View style={twStyle("mb-3")}>
      <Text style={twStyle("mb-1 text-sm font-medium text-gray-700")}>
        {tf("distanceTiers", { currency })}
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
            onChangeText={(text) => {
              const n = parseInt(text, 10) || 0;
              onChange(tiers.map((x, j) => (j === i ? { ...x, max_km: n } : x)));
            }}
            placeholder={tf("kmPlaceholder")}
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            onFocus={() => {
              const ref = { current: tierKmRefs.current.get(i) ?? null };
              onFieldFocus?.(ref);
            }}
            inputAccessoryViewID={kmAccessory}
          />
          <KeyboardDoneAccessory nativeID={kmAccessory} />
          <Text style={twStyle("text-sm text-gray-500")}>{tf("kmEquals")}</Text>
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
            onChangeText={(text) => {
              const n = parseFloat(text) || 0;
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
            accessibilityLabel={tf("removeTierA11y")}
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
          style={{ marginStart: 12, marginEnd: 6 }}
        />
        <Text style={twStyle("text-sm font-medium text-indigo-600")}>{tf("addTier")}</Text>
      </TouchableOpacity>
    </View>
  );
}
