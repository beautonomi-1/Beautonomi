"use client";

import { useEffect, useState } from "react";
import { fetcher } from "@/lib/http/fetcher";
import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface ShippingConfig {
  offers_delivery: boolean;
  offers_collection: boolean;
  delivery_fee: number;
  free_delivery_threshold: number | null;
  delivery_radius_km: number | null;
  estimated_delivery_days: number;
  delivery_notes: string | null;
}

const DEFAULTS: ShippingConfig = {
  offers_delivery: false,
  offers_collection: true,
  delivery_fee: 0,
  free_delivery_threshold: null,
  delivery_radius_km: null,
  estimated_delivery_days: 3,
  delivery_notes: null,
};

export default function ProviderShippingConfigPage() {
  const [config, setConfig] = useState<ShippingConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
      /* save failed silently */
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading shipping configuration...
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Shipping & Collection</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure how customers receive their product orders
        </p>
      </div>

      <div className="bg-white rounded-xl border p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-medium">Enable Delivery</Label>
            <p className="text-sm text-gray-500 mt-0.5">Allow customers to have products delivered</p>
          </div>
          <Switch
            checked={config.offers_delivery}
            onCheckedChange={(v) => setConfig({ ...config, offers_delivery: v })}
          />
        </div>

        {config.offers_delivery && (
          <div className="pl-4 border-l-2 border-pink-200 space-y-4">
            <div>
              <Label>Delivery Fee (R)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={config.delivery_fee}
                onChange={(e) => setConfig({ ...config, delivery_fee: parseFloat(e.target.value) || 0 })}
                className="mt-1 max-w-[200px]"
              />
            </div>
            <div>
              <Label>Free Delivery Threshold (R)</Label>
              <p className="text-xs text-gray-400 mb-1">Leave empty for no free delivery</p>
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
                placeholder="e.g. 500"
                className="mt-1 max-w-[200px]"
              />
            </div>
            <div>
              <Label>Delivery Radius (km)</Label>
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
                placeholder="e.g. 30"
                className="mt-1 max-w-[200px]"
              />
            </div>
            <div>
              <Label>Estimated Delivery Days</Label>
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
              <Label>Delivery Notes</Label>
              <textarea
                value={config.delivery_notes ?? ""}
                onChange={(e) =>
                  setConfig({ ...config, delivery_notes: e.target.value || null })
                }
                placeholder="Any special delivery instructions for customers..."
                rows={3}
                className="mt-1 w-full border rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>
          </div>
        )}

        <div className="pt-4 border-t">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Enable Collection</Label>
              <p className="text-sm text-gray-500 mt-0.5">
                Allow customers to pick up orders from your location
              </p>
            </div>
            <Switch
              checked={config.offers_collection}
              onCheckedChange={(v) => setConfig({ ...config, offers_collection: v })}
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : saved ? "Saved!" : "Save Configuration"}
        </button>
      </div>
    </div>
  );
}
