"use client";

import { useTranslation } from "@beautonomi/i18n";

import { useEffect, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";

interface ShippingConfig {
  offers_delivery: boolean;
  offers_collection: boolean;
  delivery_fee: number;
  delivery_fee_type: "flat" | "weight_based" | "distance_based";
  free_delivery_threshold: number | null;
  delivery_radius_km: number | null;
  weight_rate_per_kg: number | null;
  distance_rate_per_km: number | null;
  shipping_provider_preference: "aramex" | "courier-guy" | "bob-go" | null;
  estimated_delivery_days: number;
  delivery_notes: string | null;
  collection_notes: string | null;
}

const DEFAULTS: ShippingConfig = {
  offers_delivery: false,
  offers_collection: true,
  delivery_fee: 0,
  delivery_fee_type: "flat",
  free_delivery_threshold: null,
  delivery_radius_km: null,
  weight_rate_per_kg: null,
  distance_rate_per_km: null,
  shipping_provider_preference: null,
  estimated_delivery_days: 3,
  delivery_notes: null,
  collection_notes: null,
};

export default function ProviderShippingConfigPage() {
  const { currency } = useProviderMoneyFormat();
  const { t } = useTranslation();
  const [config, setConfig] = useState<ShippingConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [quoteCity, setQuoteCity] = useState("");
  const [quotePostal, setQuotePostal] = useState("");
  const [quoteLine1, setQuoteLine1] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [quoteResult, setQuoteResult] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetcher.get<{ data: { config: ShippingConfig } }>(
        "/api/provider/shipping-config",
      );
      if (res?.data?.config) {
        setConfig(res.data.config);
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetcher.put("/api/provider/shipping-config", config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error(t("web.provider.pages.ecommerce/shipping.failedToSave"));
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        {t("web.provider.pages.ecommerce/shipping.loading")}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("web.provider.pages.ecommerce/shipping.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t("web.provider.pages.ecommerce/shipping.subtitle")}
        </p>
      </div>

      <div className="bg-white rounded-xl border p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-medium">{t("web.provider.pages.ecommerce/shipping.enableDelivery")}</Label>
            <p className="text-sm text-gray-500 mt-0.5">{t("web.provider.pages.ecommerce/shipping.enableDeliveryHint")}</p>
          </div>
          <Switch
            checked={config.offers_delivery}
            onCheckedChange={(v) => setConfig({ ...config, offers_delivery: v })}
          />
        </div>

        {config.offers_delivery && (
          <div className="ps-4 border-s-2 border-pink-200 space-y-4">
            <div>
              <Label>{t("web.provider.pages.ecommerce/shipping.deliveryFeeModel")}</Label>
              <select
                value={config.delivery_fee_type}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    delivery_fee_type: e.target.value as ShippingConfig["delivery_fee_type"],
                  })
                }
                className="mt-1 max-w-[260px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="flat">{t("web.provider.pages.ecommerce/shipping.flatFee")}</option>
                <option value="weight_based">{t("web.provider.pages.ecommerce/shipping.basePlusWeight")}</option>
                <option value="distance_based">{t("web.provider.pages.ecommerce/shipping.basePlusDistance")}</option>
              </select>
            </div>
            <div>
<Label>{t("web.provider.pages.ecommerce/shipping.baseDeliveryFee", { currency })}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={config.delivery_fee}
                onChange={(e) => setConfig({ ...config, delivery_fee: parseFloat(e.target.value) || 0 })}
                className="mt-1 max-w-[200px]"
              />
            </div>
            {config.delivery_fee_type === "weight_based" && (
              <div>
<Label>{t("web.provider.pages.ecommerce/shipping.weightRate", { currency })}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={config.weight_rate_per_kg ?? ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      weight_rate_per_kg: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                  className="mt-1 max-w-[200px]"
                />
              </div>
            )}
            {config.delivery_fee_type === "distance_based" && (
              <div>
<Label>{t("web.provider.pages.ecommerce/shipping.distanceRate", { currency })}</Label>
                <p className="text-xs text-gray-400 mb-1">
                  {t("web.provider.pages.ecommerce/shipping.distanceRateHint")}
                </p>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={config.distance_rate_per_km ?? ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      distance_rate_per_km: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                  className="mt-1 max-w-[200px]"
                />
              </div>
            )}
            <div>
<Label>{t("web.provider.pages.ecommerce/shipping.freeDeliveryThreshold", { currency })}</Label>
              <p className="text-xs text-gray-400 mb-1">{t("web.provider.pages.ecommerce/shipping.leaveEmptyNoFree")}</p>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={config.free_delivery_threshold ?? ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    free_delivery_threshold: e.target.value ? parseFloat(e.target.value) : null,
                  })
                }
                placeholder={t("web.provider.pages.ecommerce/shipping.eG500")}
                className="mt-1 max-w-[200px]"
              />
            </div>
            <div>
              <Label>{t("web.provider.pages.ecommerce/shipping.deliveryRadius")}</Label>
              <Input
                type="number"
                min={0}
                value={config.delivery_radius_km ?? ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    delivery_radius_km: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
                placeholder={t("web.provider.pages.ecommerce/shipping.eG30")}
                className="mt-1 max-w-[200px]"
              />
            </div>
            <div>
              <Label>{t("web.provider.pages.ecommerce/shipping.estimatedDeliveryDays")}</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={config.estimated_delivery_days}
                onChange={(e) =>
                  setConfig({ ...config, estimated_delivery_days: parseInt(e.target.value) || 3 })
                }
                className="mt-1 max-w-[200px]"
              />
            </div>
            <div>
              <Label>{t("web.provider.pages.ecommerce/shipping.courierBooking")}</Label>
              <p className="text-xs text-gray-400 mb-1">
                {t("web.provider.pages.ecommerce/shipping.courierBookingHint")}
              </p>
              <select
                value={config.shipping_provider_preference ?? ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    shipping_provider_preference: (e.target.value || null) as ShippingConfig["shipping_provider_preference"],
                  })
                }
                className="mt-1 max-w-[260px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">{t("web.provider.pages.ecommerce/shipping.manualTrackingOnly")}</option>
                <option value="aramex">{t("web.provider.pages.ecommerce/shipping.aramex")}</option>
                <option value="courier-guy">{t("web.provider.pages.ecommerce/shipping.courierGuy")}</option>
                <option value="bob-go">{t("web.provider.pages.ecommerce/shipping.bobGo")}</option>
              </select>
              {config.shipping_provider_preference ? (
                <div className="mt-3 space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">
                    {t("web.provider.pages.ecommerce/shipping.probeLiveRates")}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input
                      placeholder={t("web.provider.pages.ecommerce/shipping.street")}
                      value={quoteLine1}
                      onChange={(e) => setQuoteLine1(e.target.value)}
                    />
                    <Input
                      placeholder={t("web.provider.pages.ecommerce/shipping.city")}
                      value={quoteCity}
                      onChange={(e) => setQuoteCity(e.target.value)}
                    />
                    <Input
                      placeholder={t("web.provider.settings.pages.locations.postalCode")}
                      value={quotePostal}
                      onChange={(e) => setQuotePostal(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={quoting}
                    onClick={async () => {
                      setQuoting(true);
                      setQuoteResult(null);
                      try {
                        const res = await fetcher.post<{
                          data?: {
                            ok?: boolean;
                            quotes?: { service: string; amount: number; currency: string }[];
                            skipped?: string;
                            error?: string;
                          };
                        }>("/api/provider/shipping-quotes", {
                          destination: {
                            line1: quoteLine1,
                            city: quoteCity,
                            postalCode: quotePostal,
                            country: "ZA",
                          },
                        });
                        const payload = res?.data;
                        if (payload?.skipped) {
                          setQuoteResult(
                            payload.skipped === "shipping_globally_disabled"
                              ? t("web.provider.pages.ecommerce/shipping.liveCourierOff")
                              : payload.skipped === "no_shipping_preference"
                                ? t("web.provider.pages.ecommerce/shipping.saveCourierFirst")
                                : t("web.provider.pages.ecommerce/shipping.courierNotConfigured", { reason: payload.skipped }),
                          );
                        } else if (payload?.error) {
                          setQuoteResult(payload.error);
                        } else if (payload?.quotes?.length) {
                          setQuoteResult(
                            payload.quotes
                              .map((q) => `${q.service}: ${q.currency} ${q.amount.toFixed(2)}`)
                              .join(" · "),
                          );
                        } else {
                          setQuoteResult(t("web.provider.pages.ecommerce/shipping.noRatesForRoute"));
                        }
                      } catch (err) {
                        setQuoteResult(
                          err instanceof Error ? err.message : t("web.provider.pages.ecommerce/shipping.couldNotLoadRates"),
                        );
                      }
                      setQuoting(false);
                    }}
                    className="text-xs font-medium text-pink-600 disabled:opacity-50"
                  >
                    {quoting ? t("web.provider.pages.ecommerce/shipping.checkingRates") : t("web.provider.pages.ecommerce/shipping.checkLiveRates")}
                  </button>
                  {quoteResult ? <p className="text-xs text-gray-600">{quoteResult}</p> : null}
                </div>
              ) : null}
            </div>
            <div>
              <Label>{t("web.provider.pages.ecommerce/shipping.deliveryNotes")}</Label>
              <textarea
                value={config.delivery_notes ?? ""}
                onChange={(e) =>
                  setConfig({ ...config, delivery_notes: e.target.value || null })
                }
                placeholder={t("web.provider.pages.ecommerce/shipping.deliveryNotesPlaceholder")}
                rows={3}
                className="mt-1 w-full border rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>
          </div>
        )}

        <div className="pt-4 border-t space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">{t("web.provider.pages.ecommerce/shipping.enableCollection")}</Label>
              <p className="text-sm text-gray-500 mt-0.5">
                {t("web.provider.pages.ecommerce/shipping.enableCollectionHint")}
              </p>
            </div>
            <Switch
              checked={config.offers_collection}
              onCheckedChange={(v) => setConfig({ ...config, offers_collection: v })}
            />
          </div>

          {config.offers_collection && (
            <div className="ps-4 border-s-2 border-pink-200">
              <Label>{t("web.provider.pages.ecommerce/shipping.collectionNotes")}</Label>
              <p className="text-xs text-gray-400 mb-1">
                {t("web.provider.pages.ecommerce/shipping.collectionNotesHint")}
              </p>
              <textarea
                value={config.collection_notes ?? ""}
                onChange={(e) =>
                  setConfig({ ...config, collection_notes: e.target.value || null })
                }
                placeholder={t("web.provider.pages.ecommerce/shipping.collectionNotesPlaceholder")}
                rows={3}
                maxLength={500}
                className="mt-1 w-full border rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? t("web.provider.common.saving") : saved ? t("web.provider.pages.ecommerce/shipping.saved") : t("web.provider.pages.ecommerce/shipping.saveConfiguration")}
        </button>
      </div>
    </div>
  );
}
