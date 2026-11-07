"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import type { BookingPolicyPresetId } from "@beautonomi/i18n";
import {
  BookingProtectionPresetPicker,
  depositPatchFromPreset,
} from "@/components/provider/settings/BookingProtectionPresetPicker";

type PaymentSettingsResponse = {
  requiresDeposit?: boolean;
  depositPercentage?: number;
  noShowFeeEnabled?: boolean;
  noShowFeeAmount?: number;
  acceptCash: boolean;
  acceptCard: boolean;
  acceptOnline: boolean;
  acceptPaystackTerminal?: boolean;
  paystackTerminal?: {
    platformEnabled?: boolean;
    activeTerminalCount?: number;
    selectable?: boolean;
  };
};

type GiftCardSettingsResponse = {
  enabled: boolean;
};

export default function ProviderPaymentMethodsPage() {
  const { t } = useTranslation();
  const { bundle, isLoading: isConfigLoading } = useConfigBundle();
  const yocoEnabled = bundle?.flags?.payment_yoco?.enabled === true;
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [acceptCash, setAcceptCash] = useState(false);
  const [acceptCard, setAcceptCard] = useState(true);
  const [acceptOnline, setAcceptOnline] = useState(true);
  const [acceptPaystackTerminal, setAcceptPaystackTerminal] = useState(false);
  const [paystackTerminalPlatformEnabled, setPaystackTerminalPlatformEnabled] = useState(false);
  const [paystackTerminalActiveCount, setPaystackTerminalActiveCount] = useState(0);
  const [giftCardsEnabled, setGiftCardsEnabled] = useState(false);
  const [requiresDeposit, setRequiresDeposit] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState(0);
  const [noShowFeeEnabled, setNoShowFeeEnabled] = useState(false);
  const [noShowFeeAmount, setNoShowFeeAmount] = useState(0);
  const [bookingProtectionDirty, setBookingProtectionDirty] = useState(false);

  useEffect(() => {
    if (isConfigLoading) return;
    void loadSettings();
  }, [isConfigLoading, yocoEnabled]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: PaymentSettingsResponse }>(
        "/api/provider/settings/payments"
      );
      const data = response.data;
      setAcceptCash(Boolean(data?.acceptCash));
      setAcceptCard(yocoEnabled && Boolean(data?.acceptCard));
      setAcceptOnline(Boolean(data?.acceptOnline));
      setAcceptPaystackTerminal(Boolean(data?.acceptPaystackTerminal));
      setPaystackTerminalPlatformEnabled(Boolean(data?.paystackTerminal?.platformEnabled));
      setPaystackTerminalActiveCount(data?.paystackTerminal?.activeTerminalCount ?? 0);

      const giftCardResponse = await fetcher.get<{ data: GiftCardSettingsResponse }>(
        "/api/provider/settings/sales/gift-cards"
      );
      setGiftCardsEnabled(Boolean(giftCardResponse.data?.enabled));
      setRequiresDeposit(Boolean(data?.requiresDeposit));
      setDepositPercentage(Number(data?.depositPercentage ?? 0));
      setNoShowFeeEnabled(Boolean(data?.noShowFeeEnabled));
      setNoShowFeeAmount(Number(data?.noShowFeeAmount ?? 0));
      setBookingProtectionDirty(false);
    } catch (error: any) {
toast.error(error?.message || t("web.provider.settings.pages.payments.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!acceptCash && !acceptCard && !acceptOnline) {
      toast.error(t("web.provider.settings.pages.payments.enableAtLeastOnePaymentMethod"));
      return;
    }

    try {
      setIsSaving(true);
      await Promise.all([
        fetcher.patch("/api/provider/settings/payments", {
          acceptCash,
          acceptCard: yocoEnabled ? acceptCard : false,
          acceptOnline,
          acceptPaystackTerminal: paystackTerminalPlatformEnabled ? acceptPaystackTerminal : false,
          ...(bookingProtectionDirty
            ? {
                requiresDeposit,
                depositPercentage,
                noShowFeeEnabled,
                noShowFeeAmount,
              }
            : {}),
        }),
        fetcher.patch("/api/provider/settings/sales/gift-cards", {
          gift_cards_enabled: giftCardsEnabled,
        }),
      ]);
      toast.success(t("web.provider.settings.pages.payments.paymentMethodsUpdated"));
    } catch (error: any) {
toast.error(error?.message || t("web.provider.settings.pages.payments.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.sales.items.paymentMethods.title")}
      subtitle={t("web.provider.settings.categories.sales.items.paymentMethods.description")}
      onSave={handleSave}
      saveLabel={isSaving ? t("web.provider.settings.common.saving") : t("web.provider.settings.common.saveChanges")}
      saveDisabled={isSaving || isLoading || isConfigLoading}
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
        { label: t("web.provider.settings.pages.payments.paymentMethods") },
      ]}
    >
      <SectionCard title={t("web.provider.onboarding.payment.bookingProtectionTitle")}>
        {isLoading || isConfigLoading ? null : (
          <BookingProtectionPresetPicker
            requiresDeposit={requiresDeposit}
            depositPercentage={depositPercentage}
            noShowFeeEnabled={noShowFeeEnabled}
            onPresetChange={(preset: Exclude<BookingPolicyPresetId, "custom">) => {
              const patch = depositPatchFromPreset(preset);
              setRequiresDeposit(patch.requiresDeposit);
              setDepositPercentage(patch.depositPercentage);
              setNoShowFeeEnabled(patch.noShowFeeEnabled);
              setNoShowFeeAmount(patch.noShowFeeAmount);
              setBookingProtectionDirty(true);
            }}
          />
        )}
      </SectionCard>
      <SectionCard>
        {isLoading || isConfigLoading ? (
<div className="py-8 text-center text-sm text-gray-500">{t("web.provider.settings.common.loading")}</div>
        ) : (
          <div className="space-y-4">
            {yocoEnabled && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
                <p className="text-xs text-blue-800">
{t("web.provider.settings.pages.payments.yocoBanner")}
                </p>
                <a
                  href="/provider/settings/sales/yoco-devices"
                  className="mt-1 inline-block text-xs font-semibold text-blue-700 hover:text-blue-800 underline"
                >
{t("web.provider.settings.pages.payments.manageYoco")}
                </a>
              </div>
            )}
            <MethodRow
              label={t("web.provider.settings.pages.payments.cash")}
description={t("web.provider.settings.pages.payments.cashDesc")}
              checked={acceptCash}
              onCheckedChange={setAcceptCash}
            />
            {yocoEnabled && (
              <MethodRow
label={t("web.provider.settings.pages.payments.yocoCard")}
description={t("web.provider.settings.pages.payments.yocoCardDesc")}
                checked={acceptCard}
                onCheckedChange={setAcceptCard}
              />
            )}
            <MethodRow
label={t("web.provider.settings.pages.payments.online")}
description={t("web.provider.settings.pages.payments.onlineDesc")}
              checked={acceptOnline}
              onCheckedChange={setAcceptOnline}
            />
            {paystackTerminalPlatformEnabled && (
              <div className="space-y-2">
                <MethodRow
label={t("web.provider.settings.pages.payments.paystackTerminal")}
description={t("web.provider.settings.pages.payments.paystackTerminalDesc")}
                  checked={acceptPaystackTerminal}
                  onCheckedChange={setAcceptPaystackTerminal}
                />
                {acceptPaystackTerminal && paystackTerminalActiveCount === 0 && (
                  <p className="px-1 text-xs text-amber-600">
{t("web.provider.settings.pages.payments.noActiveTerminal")}{" "}
                    <a
                      href="/provider/settings/sales/paystack-terminal"
                      className="font-semibold underline"
                    >
{t("web.provider.settings.pages.payments.paystackTerminalSettings")}
                    </a>{" "}
{t("web.provider.settings.pages.payments.noActiveTerminalSuffix")}
                  </p>
                )}
              </div>
            )}
            <MethodRow
              label={t("web.provider.settings.pages.payments.giftCards")}
description={t("web.provider.settings.pages.payments.giftCardsDesc")}
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
      <div className="pe-4">
        <Label className="text-sm font-semibold text-gray-900">{label}</Label>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
