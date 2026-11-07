"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import {
  BOOKING_POLICY_PRESETS,
  getPresetValues,
  ONBOARDING_POLICY_MORE_PRESETS,
  ONBOARDING_POLICY_PRIMARY_PRESETS,
  type BookingPolicyPresetId,
} from "@beautonomi/i18n";
import { providerDepositFieldsFromPreset } from "@/lib/provider/onboarding-booking-policy";
import { ChevronDown, ChevronUp } from "lucide-react";

function inferPresetId(input: {
  requiresDeposit: boolean;
  depositPercentage: number;
  noShowFeeEnabled: boolean;
}): Exclude<BookingPolicyPresetId, "custom"> | null {
  for (const presetId of ["strict", "standard", "flexible", "no_penalty"] as const) {
    const v = getPresetValues(presetId);
    if (
      v.requires_deposit === input.requiresDeposit &&
      v.deposit_percentage === input.depositPercentage &&
      v.no_show_fee_enabled === input.noShowFeeEnabled
    ) {
      return presetId;
    }
  }
  return null;
}

type BookingProtectionPresetPickerProps = {
  requiresDeposit: boolean;
  depositPercentage: number;
  noShowFeeEnabled: boolean;
  onPresetChange: (preset: Exclude<BookingPolicyPresetId, "custom">) => void;
};

export function BookingProtectionPresetPicker({
  requiresDeposit,
  depositPercentage,
  noShowFeeEnabled,
  onPresetChange,
}: BookingProtectionPresetPickerProps) {
  const { t } = useTranslation();
  const inferred = useMemo(
    () => inferPresetId({ requiresDeposit, depositPercentage, noShowFeeEnabled }),
    [requiresDeposit, depositPercentage, noShowFeeEnabled],
  );
  const [selected, setSelected] = useState<Exclude<BookingPolicyPresetId, "custom">>(
    inferred ?? "standard",
  );
  const [showMore, setShowMore] = useState(
    inferred != null && (ONBOARDING_POLICY_MORE_PRESETS as readonly string[]).includes(inferred),
  );

  const applyPreset = (presetId: Exclude<BookingPolicyPresetId, "custom">) => {
    setSelected(presetId);
    onPresetChange(presetId);
  };

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/80 p-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">
          {t("web.provider.onboarding.payment.bookingProtectionTitle")}
        </p>
        <p className="mt-1 text-xs text-gray-600">{t("web.provider.onboarding.payment.bookingProtectionMoneyLine1")}</p>
        <p className="text-xs text-gray-600">{t("web.provider.onboarding.payment.bookingProtectionMoneyLine2")}</p>
        <p className="mt-2 text-xs text-gray-500">{t("web.provider.onboarding.payment.bookingProtectionHint")}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {ONBOARDING_POLICY_PRIMARY_PRESETS.map((presetId) => {
          const preset = BOOKING_POLICY_PRESETS[presetId];
          const active = selected === presetId;
          const title =
            presetId === "standard"
              ? t("web.provider.onboarding.payment.policyEverydayVisits")
              : t("web.provider.onboarding.payment.policyLongJobs");
          return (
            <button
              key={presetId}
              type="button"
              onClick={() => applyPreset(presetId)}
              className={`rounded-xl border p-3 text-start text-sm transition-colors ${
                active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <span className="font-semibold text-gray-900">{title}</span>
              <p className="mt-1 text-xs text-gray-600">{t(preset.labelKey)}</p>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="flex w-full items-center justify-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
        onClick={() => setShowMore((v) => !v)}
      >
        {t("web.provider.onboarding.payment.policyMoreOptions")}
        {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {showMore ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {ONBOARDING_POLICY_MORE_PRESETS.map((presetId) => {
            const preset = BOOKING_POLICY_PRESETS[presetId];
            const active = selected === presetId;
            return (
              <button
                key={presetId}
                type="button"
                onClick={() => applyPreset(presetId)}
                className={`rounded-xl border p-3 text-start text-sm ${
                  active ? "border-primary bg-primary/5" : "border-gray-200 bg-white"
                }`}
              >
                <span className="font-semibold text-gray-900">{t(preset.labelKey)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function depositPatchFromPreset(preset: Exclude<BookingPolicyPresetId, "custom">) {
  const fields = providerDepositFieldsFromPreset(preset);
  return {
    requiresDeposit: fields.requires_deposit,
    depositPercentage: fields.deposit_percentage ?? 0,
    noShowFeeEnabled: fields.no_show_fee_enabled,
    noShowFeeAmount: fields.no_show_fee_amount ?? 0,
  };
}
