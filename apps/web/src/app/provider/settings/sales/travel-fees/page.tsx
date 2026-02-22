"use client";

import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";

interface TravelFeeSettings {
  enabled: boolean;
  rate_per_km: number | null;
  minimum_fee: number | null;
  maximum_fee: number | null;
  currency: string;
  use_platform_default: boolean;
}

interface PlatformLimits {
  provider_min_rate_per_km: number;
  provider_max_rate_per_km: number;
  provider_min_minimum_fee: number;
  provider_max_minimum_fee: number;
  allow_provider_customization: boolean;
}

export default function TravelFeesSettings() {
  const [settings, setSettings] = useState<TravelFeeSettings>({
    enabled: true,
    rate_per_km: null,
    minimum_fee: null,
    maximum_fee: null,
    currency: 'ZAR',
    use_platform_default: true,
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

      const res = await fetcher.patch<{ data: TravelFeeSettings }>(
        "/api/provider/travel-fees",
        settings
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

              {!settings.use_platform_default && platformLimits?.allow_provider_customization && (
                <div className="space-y-4 border-t pt-4">
                  <p className="text-sm font-medium text-gray-700">
                    Custom Travel Fee Rates
                  </p>
                  
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
