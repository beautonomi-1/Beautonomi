"use client";

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
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load customer visibility settings";
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
      toast.success("Customer visibility settings updated successfully!");
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to save customer visibility settings";
      toast.error(errorMessage);
      console.error("Error saving customer visibility settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading customer visibility settings..." />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="container mx-auto px-4 py-8">
        <EmptyState
          title="Failed to load settings"
          description={error || "Unable to load customer visibility settings data"}
          action={{
            label: "Retry",
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
          title="Customer Visibility"
          subtitle="Control how customer and salon information is displayed"
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Provider", href: "/provider" },
            { label: "Settings", href: "/provider/settings" },
            { label: "Customer Visibility" }
          ]}
        />

        <SectionCard>
          <div className="space-y-6">
            {/* Customer List Visibility */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Label className="text-lg font-medium">Show Customer List to Salon</Label>
                  <p className="text-sm text-gray-600">
                    Allow salon staff to see a list of customers who have booked services
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
                <div className="ml-0 mt-4 p-4 bg-gray-50 rounded-lg">
                  <Label className="text-sm font-medium mb-3 block">Customer Visibility Mode</Label>
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
                        <span className="font-medium">Show All Customers</span>
                        <p className="text-xs text-gray-500">Display all customers who have ever booked</p>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-2 border rounded-md">
                      <RadioGroupItem value="booked_only" id="customer_booked" />
                      <Label htmlFor="customer_booked" className="flex-1 cursor-pointer">
                        <span className="font-medium">Booked Customers Only</span>
                        <p className="text-xs text-gray-500">Only show customers with active or upcoming bookings</p>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-2 border rounded-md">
                      <RadioGroupItem value="none" id="customer_none" />
                      <Label htmlFor="customer_none" className="flex-1 cursor-pointer">
                        <span className="font-medium">Hide Customer List</span>
                        <p className="text-xs text-gray-500">Do not show customer list to salon staff</p>
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
                  <Label className="text-lg font-medium">Show Salon List to Customers</Label>
                  <p className="text-sm text-gray-600">
                    Allow customers to see a list of salons they have booked with
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
                <div className="ml-0 mt-4 p-4 bg-gray-50 rounded-lg">
                  <Label className="text-sm font-medium mb-3 block">Salon Visibility Mode</Label>
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
                        <span className="font-medium">Show All Salons</span>
                        <p className="text-xs text-gray-500">Display all salons the customer has interacted with</p>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-2 border rounded-md">
                      <RadioGroupItem value="booked_only" id="salon_booked" />
                      <Label htmlFor="salon_booked" className="flex-1 cursor-pointer">
                        <span className="font-medium">Booked Salons Only</span>
                        <p className="text-xs text-gray-500">Only show salons with active or upcoming bookings</p>
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 p-2 border rounded-md">
                      <RadioGroupItem value="none" id="salon_none" />
                      <Label htmlFor="salon_none" className="flex-1 cursor-pointer">
                        <span className="font-medium">Hide Salon List</span>
                        <p className="text-xs text-gray-500">Do not show salon list to customers</p>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-6 border-t">
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>
    </RoleGuard>
  );
}
