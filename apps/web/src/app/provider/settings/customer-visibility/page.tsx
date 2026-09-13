"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Save } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";

interface CustomerVisibilitySettings {
  show_customer_list_to_salon: boolean;
  show_salon_list_to_customer: boolean;
  customer_visibility_mode: "all" | "booked_only" | "none";
  salon_visibility_mode: "all" | "booked_only" | "none";
}

export default function ProviderCustomerVisibilitySettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<CustomerVisibilitySettings | null>(null);
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
      const response = await fetcher.get<{ data: CustomerVisibilitySettings }>(
        "/api/provider/customer-visibility"
      );
      setSettings(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? t("web.provider.common.requestTimeout")
          : err instanceof FetchError
          ? err.message
          : t("web.provider.settings.pages.customer-visibility.failedToLoadCustomerVisibilitySettings");
      setError(errorMessage);
      console.error("Error loading customer visibility settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setIsSaving(true);
    try {
      await fetcher.patch("/api/provider/customer-visibility", settings);
      toast.success(t("web.provider.settings.pages.customer-visibility.customerVisibilitySettingsUpdatedSuccessfully"));
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? t("web.provider.common.requestTimeout")
          : err instanceof FetchError
          ? err.message
          : t("web.provider.settings.pages.customer-visibility.failedToSave");
      toast.error(errorMessage);
      console.error("Error saving customer visibility settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.customer-visibility.loadingCustomerVisibilitySettings")} />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title={t("web.provider.settings.categories.clients.items.customerVisibility.title")}
          description={error || t("web.provider.settings.pages.customer-visibility.unableToLoad")}
          action={{
            label: t("web.provider.common.retry"),
            onClick: loadSettings,
          }}
        />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <div className="container mx-auto px-4 py-8">
        <PageHeader
          title={t("web.provider.settings.categories.clients.items.customerVisibility.title")}
          subtitle={t("web.provider.settings.categories.clients.items.customerVisibility.description")}
          breadcrumbs={[
            { label: t("web.provider.common.breadcrumbHome"), href: "/" },
            { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
            { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
            { label: t("web.provider.settings.pages.customer-visibility.customerVisibility") }
          ]}
        />

        <SectionCard>
          <div className="space-y-6">
            {/* Customer List Visibility */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Label className="text-lg font-medium">{t("web.provider.settings.pages.customer-visibility.showCustomerList")}</Label>
                  <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.customer-visibility.showCustomerListHint")}
                  </p>
                </div>
                <Switch
                  checked={settings.show_customer_list_to_salon}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => (prev ? { ...prev, show_customer_list_to_salon: checked } : null))
                  }
                />
              </div>

              {settings.show_customer_list_to_salon && (
                <div className="ms-0 mt-4 p-4 bg-gray-50 rounded-lg">
                  <Label className="text-sm font-medium mb-3 block">{t("web.provider.settings.pages.customer-visibility.customerVisibilityMode")}</Label>
                  <RadioGroup
                    value={settings.customer_visibility_mode}
                    onValueChange={(value) =>
                      setSettings((prev) =>
                        prev ? { ...prev, customer_visibility_mode: value as "all" | "booked_only" | "none" } : null
                      )
                    }
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-2 p-2 border rounded-md">
                      <RadioGroupItem value="all" id="customer_all" />
                      <Label htmlFor="customer_all" className="flex-1 cursor-pointer">
                        <span className="font-medium">{t("web.provider.settings.pages.customer-visibility.showAllCustomers")}</span>
                        <p className="text-xs text-gray-500">{t("web.provider.settings.pages.customer-visibility.showAllCustomersHint")}</p>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-2 border rounded-md">
                      <RadioGroupItem value="booked_only" id="customer_booked" />
                      <Label htmlFor="customer_booked" className="flex-1 cursor-pointer">
                        <span className="font-medium">{t("web.provider.settings.pages.customer-visibility.bookedCustomersOnly")}</span>
                        <p className="text-xs text-gray-500">{t("web.provider.settings.pages.customer-visibility.bookedCustomersOnlyHint")}</p>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-2 border rounded-md">
                      <RadioGroupItem value="none" id="customer_none" />
                      <Label htmlFor="customer_none" className="flex-1 cursor-pointer">
                        <span className="font-medium">{t("web.provider.settings.pages.customer-visibility.hideCustomerList")}</span>
                        <p className="text-xs text-gray-500">{t("web.provider.settings.pages.customer-visibility.hideCustomerListHint")}</p>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>

            {/* Salon List Visibility */}
            <div className="pt-6 border-t">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Label className="text-lg font-medium">{t("web.provider.settings.pages.customer-visibility.showSalonList")}</Label>
                  <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.customer-visibility.showSalonListHint")}
                  </p>
                </div>
                <Switch
                  checked={settings.show_salon_list_to_customer}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => (prev ? { ...prev, show_salon_list_to_customer: checked } : null))
                  }
                />
              </div>

              {settings.show_salon_list_to_customer && (
                <div className="ms-0 mt-4 p-4 bg-gray-50 rounded-lg">
                  <Label className="text-sm font-medium mb-3 block">{t("web.provider.settings.pages.customer-visibility.salonVisibilityMode")}</Label>
                  <RadioGroup
                    value={settings.salon_visibility_mode}
                    onValueChange={(value) =>
                      setSettings((prev) =>
                        prev ? { ...prev, salon_visibility_mode: value as "all" | "booked_only" | "none" } : null
                      )
                    }
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-2 p-2 border rounded-md">
                      <RadioGroupItem value="all" id="salon_all" />
                      <Label htmlFor="salon_all" className="flex-1 cursor-pointer">
                        <span className="font-medium">{t("web.provider.settings.pages.customer-visibility.showAllSalons")}</span>
                        <p className="text-xs text-gray-500">{t("web.provider.settings.pages.customer-visibility.showAllSalonsHint")}</p>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-2 border rounded-md">
                      <RadioGroupItem value="booked_only" id="salon_booked" />
                      <Label htmlFor="salon_booked" className="flex-1 cursor-pointer">
                        <span className="font-medium">{t("web.provider.settings.pages.customer-visibility.bookedSalonsOnly")}</span>
                        <p className="text-xs text-gray-500">{t("web.provider.settings.pages.customer-visibility.bookedSalonsOnlyHint")}</p>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-2 border rounded-md">
                      <RadioGroupItem value="none" id="salon_none" />
                      <Label htmlFor="salon_none" className="flex-1 cursor-pointer">
                        <span className="font-medium">{t("web.provider.settings.pages.customer-visibility.hideSalonList")}</span>
                        <p className="text-xs text-gray-500">{t("web.provider.settings.pages.customer-visibility.hideSalonListHint")}</p>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-6 border-t">
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="w-4 h-4 me-2" />
                {isSaving ? t("web.provider.common.saving") : t("web.provider.common.saveSettings")}
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>
    </RoleGuard>
  );
}
