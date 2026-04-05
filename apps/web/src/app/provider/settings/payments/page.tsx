"use client";

import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

type PaymentSettingsResponse = {
  acceptCash: boolean;
  acceptCard: boolean;
  acceptOnline: boolean;
};

type GiftCardSettingsResponse = {
  enabled: boolean;
};

export default function ProviderPaymentMethodsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [acceptCash, setAcceptCash] = useState(false);
  const [acceptCard, setAcceptCard] = useState(true);
  const [acceptOnline, setAcceptOnline] = useState(true);
  const [giftCardsEnabled, setGiftCardsEnabled] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: PaymentSettingsResponse }>(
        "/api/provider/settings/payments"
      );
      const data = response.data;
      setAcceptCash(Boolean(data?.acceptCash));
      setAcceptCard(Boolean(data?.acceptCard));
      setAcceptOnline(Boolean(data?.acceptOnline));

      const giftCardResponse = await fetcher.get<{ data: GiftCardSettingsResponse }>(
        "/api/provider/settings/sales/gift-cards"
      );
      setGiftCardsEnabled(Boolean(giftCardResponse.data?.enabled));
    } catch (error: any) {
      toast.error(error?.message || "Failed to load payment settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!acceptCash && !acceptCard && !acceptOnline) {
      toast.error("Enable at least one payment method");
      return;
    }

    try {
      setIsSaving(true);
      await Promise.all([
        fetcher.patch("/api/provider/settings/payments", {
          acceptCash,
          acceptCard,
          acceptOnline,
        }),
        fetcher.patch("/api/provider/settings/sales/gift-cards", {
          gift_cards_enabled: giftCardsEnabled,
        }),
      ]);
      toast.success("Payment methods updated");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save payment settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsDetailLayout
      title="Payment Methods"
      subtitle="Choose how customers can pay your business"
      onSave={handleSave}
      saveLabel={isSaving ? "Saving..." : "Save Changes"}
      saveDisabled={isSaving || isLoading}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Payment Methods" },
      ]}
    >
      <SectionCard>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-xs text-blue-800">
                In-person card payments are processed through your Yoco terminal.
              </p>
              <a
                href="/provider/settings/sales/yoco-devices"
                className="mt-1 inline-block text-xs font-semibold text-blue-700 hover:text-blue-800 underline"
              >
                Manage Yoco terminals
              </a>
            </div>
            <MethodRow
              label="Cash"
              description="Accept cash at your business location."
              checked={acceptCash}
              onCheckedChange={setAcceptCash}
            />
            <MethodRow
              label="In-person Card (Yoco Terminal)"
              description="Accept in-person card payments via Yoco terminal."
              checked={acceptCard}
              onCheckedChange={setAcceptCard}
            />
            <MethodRow
              label="Online Payments"
              description="Accept online checkout payments."
              checked={acceptOnline}
              onCheckedChange={setAcceptOnline}
            />
            <MethodRow
              label="Gift Cards"
              description="Allow customers to redeem platform gift cards at your business."
              checked={giftCardsEnabled}
              onCheckedChange={setGiftCardsEnabled}
            />
          </div>
        )}
      </SectionCard>
    </SettingsDetailLayout>
  );
}

function MethodRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="pr-4">
        <Label className="text-sm font-semibold text-gray-900">{label}</Label>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
