"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

interface TravelFeeTier {
  max_km: number;
  fee: number;
}

interface TravelFeeSettings {
  enabled: boolean;
  rate_per_km: number | null;
  minimum_fee: number | null;
  maximum_fee: number | null;
  currency: string;
  use_platform_default: boolean;
  pricing_model?: "per_km" | "tiered" | null;
  tiers?: TravelFeeTier[] | null;
}

interface PlatformLimits {
  default_rate_per_km?: number;
  default_minimum_fee?: number;
  default_maximum_fee?: number | null;
  default_currency?: string;
  provider_min_rate_per_km: number;
  provider_max_rate_per_km: number;
  provider_min_minimum_fee: number;
  provider_max_minimum_fee: number;
  allow_provider_customization: boolean;
  pricing_model?: "per_km" | "tiered";
  default_tiers?: TravelFeeTier[] | null;
  allow_provider_tiered?: boolean;
}

export default function TravelFeesSettings() {
  const { t } = useTranslation();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [settings, setSettings] = useState<TravelFeeSettings>({
    enabled: true,
    rate_per_km: null,
    minimum_fee: null,
    maximum_fee: null,
    currency: tenantCurrency,
    use_platform_default: true,
    pricing_model: null,
    tiers: null,
  });
  const [platformLimits, setPlatformLimits] = useState<PlatformLimits | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [previewKm, setPreviewKm] = useState(10);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        
        // Load provider settings
        const res = await fetcher.get<{ data: TravelFeeSettings }>(
          "/api/provider/travel-fees"
        );
        setSettings(res.data);

        // Load platform limits from travel fees endpoint
        // This endpoint now allows providers to read limits
        try {
          const platformRes = await fetcher.get<{ data: any }>(
            "/api/provider/travel-fees/platform-limits"
          );
          setPlatformLimits({
            default_rate_per_km: platformRes.data.default_rate_per_km ?? 8,
            default_minimum_fee: platformRes.data.default_minimum_fee ?? 20,
            default_maximum_fee: platformRes.data.default_maximum_fee ?? null,
            default_currency: platformRes.data.default_currency ?? tenantCurrency,
            provider_min_rate_per_km: platformRes.data.provider_min_rate_per_km || 0,
            provider_max_rate_per_km: platformRes.data.provider_max_rate_per_km || 50,
            provider_min_minimum_fee: platformRes.data.provider_min_minimum_fee || 0,
            provider_max_minimum_fee: platformRes.data.provider_max_minimum_fee || 100,
            allow_provider_customization: platformRes.data.allow_provider_customization !== false,
            pricing_model: platformRes.data.pricing_model ?? "per_km",
            default_tiers: platformRes.data.default_tiers ?? null,
            allow_provider_tiered: platformRes.data.allow_provider_tiered !== false,
          });
        } catch (platformError: any) {
          // If platform limits can't be loaded, use defaults
          console.warn("Failed to load platform limits, using defaults:", platformError);
          setPlatformLimits({
            default_rate_per_km: 8,
            default_minimum_fee: 20,
            default_maximum_fee: null,
            default_currency: tenantCurrency,
            provider_min_rate_per_km: 0,
            provider_max_rate_per_km: 50,
            provider_min_minimum_fee: 0,
            provider_max_minimum_fee: 100,
            allow_provider_customization: true,
            pricing_model: "per_km",
            default_tiers: null,
            allow_provider_tiered: true,
          });
        }
      } catch (e: any) {
        console.error("Error loading travel fee settings:", e);
        const errorMessage = e instanceof FetchError
          ? e.message
          : e?.error?.message || t("web.provider.settings.pages.sales/travel-fees.failedToLoadTravelFeeSettings");
        toast.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const onSave = async () => {
    try {
      setIsSaving(true);
      
      // Validate against platform limits if using custom rates
      if (!settings.use_platform_default && platformLimits) {
        if (settings.rate_per_km !== null) {
          if (settings.rate_per_km < platformLimits.provider_min_rate_per_km || 
              settings.rate_per_km > platformLimits.provider_max_rate_per_km) {
            toast.error(
              t("web.provider.settings.pages.sales/travel-fees.ratePerKmRange", { min: platformLimits.provider_min_rate_per_km, max: platformLimits.provider_max_rate_per_km })
            );
            return;
          }
        }
        if (settings.minimum_fee !== null) {
          if (settings.minimum_fee < platformLimits.provider_min_minimum_fee || 
              settings.minimum_fee > platformLimits.provider_max_minimum_fee) {
            toast.error(
              t("web.provider.settings.pages.sales/travel-fees.minimumFeeRange", { min: platformLimits.provider_min_minimum_fee, max: platformLimits.provider_max_minimum_fee })
            );
            return;
          }
        }
      }

      // Validate maximum fee if set
      if (settings.maximum_fee !== null && settings.maximum_fee < 0) {
        toast.error(t("web.provider.settings.pages.sales/travel-fees.maximumFeeCannotBeNegative"));
        return;
      }

      // Validate currency
      if (settings.currency && settings.currency.length !== 3) {
        toast.error(t("web.provider.settings.pages.sales/travel-fees.currencyMustBeA3Letter"));
        return;
      }

      if (!settings.use_platform_default && settings.pricing_model === "tiered") {
        const tiers = settings.tiers ?? [];
        if (tiers.length === 0) {
          toast.error(t("web.provider.settings.pages.sales/travel-fees.addAtLeastOneDistanceTier"));
          return;
        }
        for (let i = 1; i < tiers.length; i++) {
          if (tiers[i].max_km <= tiers[i - 1].max_km) {
            toast.error(t("web.provider.settings.pages.sales/travel-fees.tiersMustBeInAscendingOrder"));
            return;
          }
        }
      }

      const payload: Record<string, unknown> = {
        enabled: settings.enabled,
        use_platform_default: settings.use_platform_default,
        rate_per_km: settings.rate_per_km,
        minimum_fee: settings.minimum_fee,
        maximum_fee: settings.maximum_fee,
        currency: settings.currency,
      };
      if (settings.pricing_model !== undefined) payload.pricing_model = settings.pricing_model;
      if (settings.tiers !== undefined) payload.tiers = settings.tiers;

      const res = await fetcher.patch<{ data: TravelFeeSettings }>(
        "/api/provider/travel-fees",
        payload
      );
      setSettings(res.data);
      toast.success(t("web.provider.settings.pages.sales/travel-fees.travelFeeSettingsSavedSuccessfully"));
    } catch (e: any) {
      const errorMessage = e instanceof FetchError
        ? e.message
        : e?.error?.message || t("web.provider.settings.pages.sales/travel-fees.failedToSaveTravelFeeSettings");
      toast.error(errorMessage);
      console.error("Error saving travel fee settings:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.sales/travel-fees.sales"), href: "/provider/settings/sales/yoco-integration" },
    { label: t("web.provider.settings.pages.sales/travel-fees.travelFees") },
  ];

  const previewCurrency =
    settings.use_platform_default
      ? platformLimits?.default_currency || settings.currency || tenantCurrency
      : settings.currency || tenantCurrency;

  const previewFee = (() => {
    if (!settings.enabled) return 0;
    const km = Math.max(0, Number(previewKm) || 0);
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
  })();

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.sales.items.travelFees.title")}
        subtitle={t("web.provider.settings.categories.sales.items.travelFees.description")}
        onSave={onSave}
        isSaving={isSaving}
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
          <LoadingTimeout loadingMessage={t("web.provider.settings.pages.sales/travel-fees.loadingTravelFeeSettings")} />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.pages.sales/travel-fees.travelFees")}
      subtitle={t("web.provider.settings.pages.sales/travel-fees.configureTravelFeesForAtHome")}
      onSave={onSave}
      isSaving={isSaving}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard>
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{t("web.provider.settings.pages.sales/travel-fees.houseCallsTravelSetup")}</h2>
            <p className="mt-1 text-sm text-gray-600">
              {t("web.provider.settings.pages.sales/travel-fees.houseCallsTravelBody")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link
              href="/provider/settings/distance"
              className="rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-800 hover:border-primary hover:text-primary"
            >
              {t("web.provider.settings.pages.sales/travel-fees.distanceAndRadius")}
              <span className="mt-1 block text-xs font-normal text-gray-500">{t("web.provider.settings.pages.sales/travel-fees.howFarYouTravel")}</span>
            </Link>
            <Link
              href="/provider/settings/service-zones"
              className="rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-800 hover:border-primary hover:text-primary"
            >
              {t("web.provider.settings.pages.sales/travel-fees.serviceZones")}
              <span className="mt-1 block text-xs font-normal text-gray-500">{t("web.provider.settings.pages.sales/travel-fees.whereAtHomeAllowed")}</span>
            </Link>
            <Link
              href="/provider/settings/appointment-activity/online-booking"
              className="rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-800 hover:border-primary hover:text-primary"
            >
              {t("web.provider.settings.pages.sales/travel-fees.onlineBookingRules")}
              <span className="mt-1 block text-xs font-normal text-gray-500">{t("web.provider.settings.pages.sales/travel-fees.leadTimeWindows")}</span>
            </Link>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("web.provider.settings.pages.sales/travel-fees.enableTravelFees")}</Label>
              <p className="text-sm text-gray-600 mt-1">
                {t("web.provider.settings.pages.sales/travel-fees.chargeCustomersForTravel")}
              </p>
            </div>
            <Checkbox
              checked={settings.enabled}
              onCheckedChange={(checked) => 
                setSettings({ ...settings, enabled: checked === true })
              }
            />
          </div>

          {settings.enabled && (
            <>
              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <Label>{t("web.provider.settings.pages.sales/travel-fees.usePlatformDefaultRates")}</Label>
                  <p className="text-sm text-gray-600 mt-1">
                    {t("web.provider.settings.pages.sales/travel-fees.usePlatformDefaultHint")}
                  </p>
                </div>
                <Checkbox
                  checked={settings.use_platform_default}
                  onCheckedChange={(checked) => 
                    setSettings({ ...settings, use_platform_default: checked === true })
                  }
                />
              </div>

              <div className="rounded-xl border border-sky-100 bg-sky-50 p-4">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <Label htmlFor="travel_fee_preview_km">{t("web.provider.settings.pages.sales/travel-fees.liveTravelFeePreview")}</Label>
                    <p className="mt-1 text-sm text-sky-800">
                      {t("web.provider.settings.pages.sales/travel-fees.previewUsesSameModel")}
                    </p>
                  </div>
                  <div className="flex items-end gap-3">
                    <div>
                      <Label htmlFor="travel_fee_preview_km" className="text-xs text-sky-900">
                        {t("web.provider.settings.pages.sales/travel-fees.distance")}
                      </Label>
                      <Input
                        id="travel_fee_preview_km"
                        type="number"
                        min={0}
                        step={1}
                        value={previewKm}
                        onChange={(e) => setPreviewKm(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="mt-1 w-24 bg-white"
                      />
                    </div>
                    <div className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm">
{t("web.provider.settings.pages.sales/travel-fees.previewKmFee", { km: previewKm, currency: previewCurrency, fee: previewFee.toFixed(2) })}
                    </div>
                  </div>
                </div>
              </div>

              {settings.use_platform_default && platformLimits?.default_tiers?.length && platformLimits?.pricing_model === "tiered" && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">{t("web.provider.settings.pages.sales/travel-fees.platformDefaultTiers")}</p>
                  <ul className="text-sm text-gray-600 list-disc list-inside">
                    {platformLimits.default_tiers.map((tier, i) => (
                      <li key={i}>{t("web.provider.settings.pages.sales/travel-fees.upToKmFee", { km: tier.max_km, currency: settings.currency, fee: tier.fee })}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!settings.use_platform_default && platformLimits?.allow_provider_customization && (
                <div className="space-y-4 border-t pt-4">
                  <p className="text-sm font-medium text-gray-700">
                    {t("web.provider.settings.pages.sales/travel-fees.customTravelFeeRates")}
                  </p>

                  {platformLimits?.allow_provider_tiered && (
                    <div>
                      <Label>{t("web.provider.settings.pages.sales/travel-fees.pricingModel")}</Label>
                      <div className="flex gap-4 mt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="provider_pricing_model"
                            checked={(settings.pricing_model ?? "per_km") === "per_km"}
                            onChange={() =>
                              setSettings({ ...settings, pricing_model: "per_km", tiers: null })
                            }
                            className="w-4 h-4"
                          />
                          <span className="text-sm">{t("web.provider.settings.pages.sales/travel-fees.perKilometer")}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="provider_pricing_model"
                            checked={settings.pricing_model === "tiered"}
                            onChange={() => {
                              const tiers = Array.isArray(settings.tiers) && settings.tiers.length > 0
                                ? settings.tiers
                                : [{ max_km: 10, fee: 100 }];
                              setSettings({ ...settings, pricing_model: "tiered", tiers });
                            }}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">{t("web.provider.settings.pages.sales/travel-fees.distanceTiers")}</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {(!platformLimits?.allow_provider_tiered || (settings.pricing_model ?? "per_km") === "per_km") && (
                    <>
                  <div>
                    <Label htmlFor="rate_per_km">
                      {t("web.provider.settings.pages.sales/travel-fees.ratePerKilometer", { currency: settings.currency })}
                      {platformLimits && (
                        <span className="text-xs text-gray-500 ms-2">
{t("web.provider.settings.pages.sales/travel-fees.minMaxHint", { min: platformLimits.provider_min_rate_per_km, max: platformLimits.provider_max_rate_per_km })}
                        </span>
                      )}
                    </Label>
                    <Input
                      id="rate_per_km"
                      type="number"
                      inputMode="decimal"
                      min={platformLimits?.provider_min_rate_per_km || 0}
                      max={platformLimits?.provider_max_rate_per_km || 50}
                      step={0.01}
                      value={settings.rate_per_km || ""}
                      onChange={(e) => 
                        setSettings({ 
                          ...settings, 
                          rate_per_km: e.target.value ? parseFloat(e.target.value) : null 
                        })
                      }
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t("web.provider.settings.pages.sales/travel-fees.amountPerKm")}
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="minimum_fee">
                      {t("web.provider.settings.pages.sales/travel-fees.minimumFee", { currency: settings.currency })}
                      {platformLimits && (
                        <span className="text-xs text-gray-500 ms-2">
{t("web.provider.settings.pages.sales/travel-fees.minMaxHint", { min: platformLimits.provider_min_minimum_fee, max: platformLimits.provider_max_minimum_fee })}
                        </span>
                      )}
                    </Label>
                    <Input
                      id="minimum_fee"
                      type="number"
                      inputMode="decimal"
                      min={platformLimits?.provider_min_minimum_fee || 0}
                      max={platformLimits?.provider_max_minimum_fee || 100}
                      step={0.01}
                      value={settings.minimum_fee || ""}
                      onChange={(e) => 
                        setSettings({ 
                          ...settings, 
                          minimum_fee: e.target.value ? parseFloat(e.target.value) : null 
                        })
                      }
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t("web.provider.settings.pages.sales/travel-fees.minimumFeeHint")}
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="maximum_fee">
                      {t("web.provider.settings.pages.sales/travel-fees.maximumFeeOptional", { currency: settings.currency })}
                    </Label>
                    <Input
                      id="maximum_fee"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.01}
                      value={settings.maximum_fee || ""}
                      onChange={(e) => 
                        setSettings({ 
                          ...settings, 
                          maximum_fee: e.target.value ? parseFloat(e.target.value) : null 
                        })
                      }
                      className="mt-1"
                      placeholder={t("web.provider.settings.pages.sales/travel-fees.noMaximum")}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t("web.provider.settings.pages.sales/travel-fees.maximumFeeHint")}
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="currency">{t("web.provider.settings.pages.sales/travel-fees.currency")}</Label>
                    <Input
                      id="currency"
                      type="text"
                      value={settings.currency}
                      onChange={(e) =>
                        setSettings({ ...settings, currency: e.target.value.toUpperCase() })
                      }
                      className="mt-1"
                      maxLength={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {t("web.provider.settings.pages.sales/travel-fees.currencyCodeHint")}
                    </p>
                  </div>
                    </>
                  )}

                  {platformLimits?.allow_provider_tiered && settings.pricing_model === "tiered" && (
                    <div className="space-y-2">
                      <Label>{t("web.provider.settings.pages.sales/travel-fees.distanceTiers")}</Label>
                      <p className="text-xs text-gray-500">{t("web.provider.settings.pages.sales/travel-fees.tiersHint")}</p>
                      {(settings.tiers ?? []).map((tier, i) => (
                        <div key={i} className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-gray-600">{t("web.provider.settings.pages.sales/travel-fees.upTo")}</span>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={tier.max_km}
                            onChange={(e) => {
                              const next = [...(settings.tiers ?? [])];
                              next[i] = { ...next[i], max_km: parseInt(e.target.value, 10) || 0 };
                              setSettings({ ...settings, tiers: next });
                            }}
                            className="w-24"
                          />
                          <span className="text-sm text-gray-600">{t("web.provider.settings.pages.sales/travel-fees.kmEquals")}</span>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={tier.fee}
                            onChange={(e) => {
                              const next = [...(settings.tiers ?? [])];
                              next[i] = { ...next[i], fee: parseFloat(e.target.value) || 0 };
                              setSettings({ ...settings, tiers: next });
                            }}
                            className="w-28"
                          />
                          <span className="text-sm text-gray-600">{settings.currency}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              setSettings({
                                ...settings,
                                tiers: (settings.tiers ?? []).filter((_, j) => j !== i),
                              })
                            }
                            aria-label={t("web.provider.settings.pages.sales/travel-fees.removeTier")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const tiers = settings.tiers ?? [];
                          const last = tiers[tiers.length - 1];
                          const nextMaxKm = last ? last.max_km + 10 : 10;
                          setSettings({
                            ...settings,
                            tiers: [...tiers, { max_km: nextMaxKm, fee: 100 }],
                          });
                        }}
                      >
                        <Plus className="w-4 h-4 me-1" />
                        {t("web.provider.settings.pages.sales/travel-fees.addTier")}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {!platformLimits?.allow_provider_customization && (
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600">
                    {t("web.provider.settings.pages.sales/travel-fees.customizationDisabled")}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
