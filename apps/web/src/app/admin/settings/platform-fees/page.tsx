"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, DollarSign } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";

interface PlatformFeesSettings {
  platform_service_fee_type: "percentage" | "fixed";
  platform_service_fee_percentage: number;
  platform_service_fee_fixed: number;
  show_service_fee_to_customer: boolean;
}

export default function PlatformFeesPage() {
  const [settings, setSettings] = useState<PlatformFeesSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: PlatformFeesSettings }>(
        "/api/admin/platform-fees"
      );
      setSettings(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load platform fees settings";
      setError(errorMessage);
      console.error("Error loading platform fees settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setIsSaving(true);
      await fetcher.patch("/api/admin/platform-fees", settings);
      toast.success("Platform fees settings saved successfully");
    } catch (error) {
      toast.error("Failed to save platform fees settings");
      console.error("Error saving settings:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSettings = (updates: Partial<PlatformFeesSettings>) => {
    setSettings((prev) => {
      if (!prev) return null;
      return { ...prev, ...updates };
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading platform fees settings..." />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Failed to load platform fees settings"
          description={error || "Unable to load platform fees settings"}
          action={{
            label: "Retry",
            onClick: loadSettings,
          }}
        />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold mb-2 flex items-center gap-2">
            <DollarSign className="w-6 h-6 sm:w-8 sm:h-8" />
            Platform Fees Control
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Configure platform service fees charged to customers
          </p>
        </div>

        <div className="bg-white border rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <Label htmlFor="show_service_fee_to_customer" className="text-sm sm:text-base">
                Show Service Fee to Customers
              </Label>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Display the platform service fee to customers during checkout
              </p>
            </div>
            <input
              type="checkbox"
              id="show_service_fee_to_customer"
              checked={settings.show_service_fee_to_customer}
              onChange={(e) =>
                updateSettings({ show_service_fee_to_customer: e.target.checked })
              }
              className="w-5 h-5"
            />
          </div>

          <div>
            <Label htmlFor="platform_service_fee_type" className="text-sm sm:text-base">
              Service Fee Type *
            </Label>
            <select
              id="platform_service_fee_type"
              value={settings.platform_service_fee_type}
              onChange={(e) =>
                updateSettings({
                  platform_service_fee_type: e.target.value as "percentage" | "fixed",
                })
              }
              className="w-full p-2 sm:p-3 border rounded-md text-sm sm:text-base mt-1 touch-target"
            >
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed Amount</option>
            </select>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Choose whether the service fee is a percentage of the booking total or a fixed amount
            </p>
          </div>

          {settings.platform_service_fee_type === "percentage" ? (
            <div>
              <Label htmlFor="platform_service_fee_percentage" className="text-sm sm:text-base">
                Service Fee Percentage *
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="platform_service_fee_percentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={settings.platform_service_fee_percentage}
                  onChange={(e) =>
                    updateSettings({
                      platform_service_fee_percentage: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="flex-1"
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Percentage of booking total charged to customers (e.g., 5% for a R100 booking = R5 fee)
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="platform_service_fee_fixed" className="text-sm sm:text-base">
                Service Fee Fixed Amount *
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="platform_service_fee_fixed"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.platform_service_fee_fixed}
                  onChange={(e) =>
                    updateSettings({
                      platform_service_fee_fixed: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="flex-1"
                />
                <span className="text-xs sm:text-sm text-gray-600">ZAR</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Fixed amount charged to customers per booking (e.g., R10 per booking)
              </p>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-xs sm:text-sm text-blue-800">
              <strong>Note:</strong> Platform service fees are separate from provider commissions. 
              Service fees are charged to customers, while commissions are deducted from provider payouts. 
              Changes to these settings will apply to all new bookings.
            </p>
          </div>
        </div>

        <div className="mt-4 sm:mt-6 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full sm:w-auto touch-target"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </RoleGuard>
  );
}
