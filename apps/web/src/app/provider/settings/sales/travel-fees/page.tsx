"use client";

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
          : e?.error?.message || "Failed to load travel fee settings";
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
              `Rate per km must be between ${platformLimits.provider_min_rate_per_km} and ${platformLimits.provider_max_rate_per_km}`
            );
            return;
          }
        }
        if (settings.minimum_fee !== null) {
          if (settings.minimum_fee < platformLimits.provider_min_minimum_fee || 
              settings.minimum_fee > platformLimits.provider_max_minimum_fee) {
            toast.error(
              `Minimum fee must be between ${platformLimits.provider_min_minimum_fee} and ${platformLimits.provider_max_minimum_fee}`
            );
            return;
          }
        }
      }

      // Validate maximum fee if set
      if (settings.maximum_fee !== null && settings.maximum_fee < 0) {
        toast.error("Maximum fee cannot be negative");
        return;
      }

      // Validate currency
      if (settings.currency && settings.currency.length !== 3) {
        toast.error("Currency must be a 3-letter code (e.g., ZAR, USD)");
        return;
      }

      if (!settings.use_platform_default && settings.pricing_model === "tiered") {
        const tiers = settings.tiers ?? [];
        if (tiers.length === 0) {
          toast.error("Add at least one distance tier");
          return;
        }
        for (let i = 1; i < tiers.length; i++) {
          if (tiers[i].max_km <= tiers[i - 1].max_km) {
            toast.error("Tiers must be in ascending order by max km");
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
      toast.success("Travel fee settings saved successfully");
    } catch (e: any) {
      const errorMessage = e instanceof FetchError
        ? e.message
        : e?.error?.message || "Failed to save travel fee settings";
      toast.error(errorMessage);
      console.error("Error saving travel fee settings:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Sales", href: "/provider/settings/sales/yoco-integration" },
    { label: "Travel Fees" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Travel Fees"
        subtitle="Configure travel fees for at-home services"
        onSave={onSave}
        isSaving={isSaving}
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
          <LoadingTimeout loadingMessage="Loading travel fee settings..." />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Travel Fees"
      subtitle="Configure travel fees for at-home services"
      onSave={onSave}
      isSaving={isSaving}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Travel Fees</Label>
              <p className="text-sm text-gray-600 mt-1">
                Charge customers for travel to their location
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
                  <Label>Use Platform Default Rates</Label>
                  <p className="text-sm text-gray-600 mt-1">
                    Use the platform's default travel fee rates
                  </p>
                </div>
                <Checkbox
                  checked={settings.use_platform_default}
                  onCheckedChange={(checked) => 
                    setSettings({ ...settings, use_platform_default: checked === true })
                  }
                />
              </div>

              {settings.use_platform_default && platformLimits?.default_tiers?.length && platformLimits?.pricing_model === "tiered" && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Platform default: distance tiers</p>
                  <ul className="text-sm text-gray-600 list-disc list-inside">
                    {platformLimits.default_tiers.map((t, i) => (
                      <li key={i}>Up to {t.max_km} km = {settings.currency} {t.fee}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!settings.use_platform_default && platformLimits?.allow_provider_customization && (
                <div className="space-y-4 border-t pt-4">
                  <p className="text-sm font-medium text-gray-700">
                    Custom Travel Fee Rates
                  </p>

                  {platformLimits?.allow_provider_tiered && (
                    <div>
                      <Label>Pricing model</Label>
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
                          <span className="text-sm">Per kilometer</span>
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
                          <span className="text-sm">Distance tiers</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {(!platformLimits?.allow_provider_tiered || (settings.pricing_model ?? "per_km") === "per_km") && (
                    <>
                  <div>
                    <Label htmlFor="rate_per_km">
                      Rate per Kilometer ({settings.currency})
                      {platformLimits && (
                        <span className="text-xs text-gray-500 ml-2">
                          (Min: {platformLimits.provider_min_rate_per_km}, Max: {platformLimits.provider_max_rate_per_km})
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
                      Amount charged per kilometer traveled
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="minimum_fee">
                      Minimum Fee ({settings.currency})
                      {platformLimits && (
                        <span className="text-xs text-gray-500 ml-2">
                          (Min: {platformLimits.provider_min_minimum_fee}, Max: {platformLimits.provider_max_minimum_fee})
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
                      Minimum travel fee regardless of distance
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="maximum_fee">
                      Maximum Fee ({settings.currency}) - Optional
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
                      placeholder="No maximum"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Maximum travel fee cap (leave empty for no limit)
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="currency">Currency</Label>
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
                      Currency code (e.g., ZAR, USD)
                    </p>
                  </div>
                    </>
                  )}

                  {platformLimits?.allow_provider_tiered && settings.pricing_model === "tiered" && (
                    <div className="space-y-2">
                      <Label>Distance tiers</Label>
                      <p className="text-xs text-gray-500">Fixed fee per distance band. Add tiers in ascending order by max km.</p>
                      {(settings.tiers ?? []).map((tier, i) => (
                        <div key={i} className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-gray-600">Up to</span>
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
                          <span className="text-sm text-gray-600">km =</span>
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
                            aria-label="Remove tier"
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
                        <Plus className="w-4 h-4 mr-1" />
                        Add tier
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {!platformLimits?.allow_provider_customization && (
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600">
                    Provider customization is currently disabled by the platform. 
                    You must use the platform default rates.
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
