"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { fetcher } from "@/lib/http/fetcher";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import {
  DEFAULT_ONBOARDING_TRAVEL_FEES,
  type OnboardingTravelFees,
  type PlatformTravelLimits,
} from "@/app/provider/onboarding/onboarding-travel-types";
import { ONBOARDING_BRAND_SOFT, ONBOARDING_SURFACE_INFO } from "@/app/provider/onboarding/onboarding-styles";

type Props = {
  travelFees: OnboardingTravelFees;
  platformLimits: PlatformTravelLimits | null | undefined;
  tenantCurrency: string;
  onChange: (patch: Partial<OnboardingTravelFees>) => void;
  onPlatformLimitsLoaded: (limits: PlatformTravelLimits) => void;
  validationErrors?: string[];
};

function computePreviewFee(
  km: number,
  settings: OnboardingTravelFees,
  platformLimits: PlatformTravelLimits | null | undefined,
): number {
  if (!settings.enabled) return 0;
  const pricingModel = settings.use_platform_default
    ? platformLimits?.pricing_model ?? "per_km"
    : settings.pricing_model ?? "per_km";
  const tiers = settings.use_platform_default ? platformLimits?.default_tiers : settings.tiers;
  if (pricingModel === "tiered" && Array.isArray(tiers) && tiers.length > 0) {
    const sorted = [...tiers].sort((a, b) => a.max_km - b.max_km);
    return sorted.find((tier) => km <= tier.max_km)?.fee ?? sorted[sorted.length - 1].fee;
  }
  const rate = settings.use_platform_default
    ? Number(platformLimits?.default_rate_per_km ?? 8)
    : Number(settings.rate_per_km ?? platformLimits?.default_rate_per_km ?? 8);
  const minimum = settings.use_platform_default
    ? Number(platformLimits?.default_minimum_fee ?? 20)
    : Number(settings.minimum_fee ?? platformLimits?.default_minimum_fee ?? 20);
  const maximumRaw = settings.use_platform_default
    ? platformLimits?.default_maximum_fee
    : settings.maximum_fee;
  const uncapped = minimum + km * rate;
  return maximumRaw != null ? Math.min(uncapped, Number(maximumRaw)) : uncapped;
}

export function TravelFeesOnboardingForm({
  travelFees,
  platformLimits,
  tenantCurrency,
  onChange,
  onPlatformLimitsLoaded,
  validationErrors = [],
}: Props) {
  const { t } = useTranslation();
  const tf = travelFees ?? DEFAULT_ONBOARDING_TRAVEL_FEES;
  const [loadingLimits, setLoadingLimits] = useState(!platformLimits);
  const [previewKm, setPreviewKm] = useState(10);
  const fetchStartedRef = useRef(false);

  useEffect(() => {
    if (platformLimits) {
      setLoadingLimits(false);
      return;
    }
    if (fetchStartedRef.current) return;
    fetchStartedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        setLoadingLimits(true);
        const res = await fetcher.get<{ data: PlatformTravelLimits }>(
          "/api/provider/travel-fees/platform-limits",
        );
        if (!cancelled && res.data) {
          onPlatformLimitsLoaded(res.data);
        }
      } catch (e) {
        console.warn("Failed to load platform travel limits", e);
      } finally {
        if (!cancelled) setLoadingLimits(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [platformLimits, onPlatformLimitsLoaded]);

  const currency =
    tf.use_platform_default && platformLimits
      ? platformLimits.default_currency
      : tf.currency || platformLimits?.default_currency || tenantCurrency;

  const previewFee = useMemo(
    () => computePreviewFee(Math.max(0, previewKm), tf, platformLimits),
    [previewKm, tf, platformLimits],
  );

  const customizationLocked =
    platformLimits != null && platformLimits.allow_provider_customization === false;
  const useDefaults = tf.use_platform_default !== false;

  const fieldError = (needle: RegExp) =>
    validationErrors.find((e) => needle.test(e)) ?? null;

  if (loadingLimits && !platformLimits) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary-hover" aria-hidden />
        <span className="text-sm font-medium text-slate-800">
          {t("web.provider.onboarding.travelFees.loadingDefaults")}
        </span>
      </div>
    );
  }

  const limits = platformLimits;

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-slate-600">
        {t("web.provider.onboarding.steps.travelFees.description")}
      </p>

      {limits ? (
        <div className={`${ONBOARDING_SURFACE_INFO} p-4 sm:p-5`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            {t("web.provider.onboarding.travelFees.platformStandard")}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              {
                label: t("web.provider.onboarding.travelFees.ratePerKm"),
                value: `${limits.default_currency} ${limits.default_rate_per_km}`,
              },
              {
                label: t("web.provider.onboarding.travelFees.minimumFee"),
                value: `${limits.default_currency} ${limits.default_minimum_fee}`,
              },
              {
                label: t("web.provider.onboarding.travelFees.freeWithinKm"),
                value: String(limits.default_free_within_km ?? 0),
              },
              {
                label: t("web.provider.onboarding.travelFees.maximumFee"),
                value:
                  limits.default_maximum_fee != null
                    ? `${limits.default_currency} ${limits.default_maximum_fee}`
                    : "—",
              },
            ].map((cell) => (
              <div key={cell.label}>
                <p className="text-xs text-slate-600">{cell.label}</p>
                <p className="text-base font-semibold text-slate-900">{cell.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="travel-fees-enabled" className="text-sm font-medium text-slate-900">
            {t("web.provider.onboarding.travelFees.enable")}
          </Label>
          <p className="mt-1 text-xs text-slate-600">
            {t("web.provider.onboarding.travelFees.enableHint")}
          </p>
        </div>
        <Switch
          id="travel-fees-enabled"
          checked={tf.enabled}
          onCheckedChange={(checked) => onChange({ enabled: checked })}
        />
      </div>

      {tf.enabled ? (
        <>
          {customizationLocked ? (
            <div
              className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="status"
            >
              {t("web.provider.onboarding.travelFees.platformLocked")}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <div>
              <Label htmlFor="travel-use-defaults" className="text-sm font-medium text-slate-900">
                {t("web.provider.onboarding.travelFees.usePlatformDefault")}
              </Label>
              <p className="mt-1 text-xs text-slate-600">
                {t("web.provider.onboarding.travelFees.usePlatformDefaultHint")}
              </p>
            </div>
            <Switch
              id="travel-use-defaults"
              checked={useDefaults}
              disabled={customizationLocked}
              aria-disabled={customizationLocked}
              onCheckedChange={(checked) => onChange({ use_platform_default: checked })}
            />
          </div>

          <div className={`${ONBOARDING_SURFACE_INFO} p-4`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Label htmlFor="travel-preview-km" className="text-sm text-slate-700">
                  {t("web.provider.onboarding.travelFees.previewLabel")}
                </Label>
                <Input
                  id="travel-preview-km"
                  type="number"
                  min={0}
                  step={1}
                  value={previewKm}
                  onChange={(e) => setPreviewKm(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="mt-1 w-24 bg-white"
                />
              </div>
              <div
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${ONBOARDING_BRAND_SOFT}`}
              >
                {t("web.provider.onboarding.travelFees.previewAtKm", {
                  km: previewKm,
                  currency,
                  fee: previewFee.toFixed(2),
                })}
              </div>
            </div>
          </div>

          {!useDefaults && !customizationLocked && limits?.allow_provider_customization ? (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              {limits.allow_provider_tiered ? (
                <div>
                  <Label className="text-sm text-slate-900">
                    {t("web.provider.onboarding.travelFees.pricingModel")}
                  </Label>
                  <div className="mt-2 flex flex-wrap gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                      <input
                        type="radio"
                        name="onboarding_pricing_model"
                        checked={(tf.pricing_model ?? "per_km") === "per_km"}
                        onChange={() => onChange({ pricing_model: "per_km", tiers: null })}
                        className="h-4 w-4"
                      />
                      {t("web.provider.onboarding.travelFees.perKm")}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                      <input
                        type="radio"
                        name="onboarding_pricing_model"
                        checked={tf.pricing_model === "tiered"}
                        onChange={() =>
                          onChange({
                            pricing_model: "tiered",
                            tiers:
                              Array.isArray(tf.tiers) && tf.tiers.length > 0
                                ? tf.tiers
                                : [{ max_km: 10, fee: 100 }],
                          })
                        }
                        className="h-4 w-4"
                      />
                      {t("web.provider.onboarding.travelFees.tiered")}
                    </label>
                  </div>
                </div>
              ) : null}

              {(tf.pricing_model ?? "per_km") === "per_km" || !limits.allow_provider_tiered ? (
                <>
                  <div>
                    <Label htmlFor="onboarding_rate_per_km" className="text-sm text-slate-900">
                      {t("web.provider.onboarding.travelFees.ratePerKmInput", { currency })}
                      {limits ? (
                        <span className="ms-2 text-xs text-slate-600">
                          ({limits.provider_min_rate_per_km}–{limits.provider_max_rate_per_km})
                        </span>
                      ) : null}
                    </Label>
                    <Input
                      id="onboarding_rate_per_km"
                      type="number"
                      inputMode="decimal"
                      min={limits?.provider_min_rate_per_km ?? 0}
                      max={limits?.provider_max_rate_per_km ?? 50}
                      step={0.01}
                      value={tf.rate_per_km ?? ""}
                      onChange={(e) =>
                        onChange({
                          rate_per_km: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                      className="mt-1"
                    />
                    {fieldError(/rate per km/i) ? (
                      <p className="mt-1 text-sm text-red-700">{fieldError(/rate per km/i)}</p>
                    ) : null}
                  </div>
                  <div>
                    <Label htmlFor="onboarding_minimum_fee" className="text-sm text-slate-900">
                      {t("web.provider.onboarding.travelFees.minimumFeeInput", { currency })}
                    </Label>
                    <Input
                      id="onboarding_minimum_fee"
                      type="number"
                      inputMode="decimal"
                      min={limits?.provider_min_minimum_fee ?? 0}
                      max={limits?.provider_max_minimum_fee ?? 100}
                      step={0.01}
                      value={tf.minimum_fee ?? ""}
                      onChange={(e) =>
                        onChange({
                          minimum_fee: e.target.value ? parseFloat(e.target.value) : null,
                        })
                      }
                      className="mt-1"
                    />
                    {fieldError(/minimum fee/i) ? (
                      <p className="mt-1 text-sm text-red-700">{fieldError(/minimum fee/i)}</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  {(tf.tiers ?? []).map((tier, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <div>
                        <Label className="text-xs text-slate-600">
                          {t("web.provider.onboarding.travelFees.tierMaxKm")}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          value={tier.max_km}
                          onChange={(e) => {
                            const tiers = [...(tf.tiers ?? [])];
                            tiers[i] = { ...tiers[i], max_km: parseFloat(e.target.value) || 0 };
                            onChange({ tiers });
                          }}
                          className="mt-1 w-24"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">
                          {t("web.provider.onboarding.travelFees.tierFee", { currency })}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          value={tier.fee}
                          onChange={(e) => {
                            const tiers = [...(tf.tiers ?? [])];
                            tiers[i] = { ...tiers[i], fee: parseFloat(e.target.value) || 0 };
                            onChange({ tiers });
                          }}
                          className="mt-1 w-28"
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-sm font-semibold text-primary-hover underline-offset-2 hover:underline"
                    onClick={() =>
                      onChange({
                        tiers: [...(tf.tiers ?? []), { max_km: 20, fee: 150 }],
                      })
                    }
                  >
                    {t("web.provider.onboarding.travelFees.addTier")}
                  </button>
                  {fieldError(/tier/i) ? (
                    <p className="text-sm text-red-700">{fieldError(/tier/i)}</p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
