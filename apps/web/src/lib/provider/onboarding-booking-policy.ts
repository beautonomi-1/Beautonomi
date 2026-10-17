import {
  BOOKING_POLICY_PRESETS,
  getPresetValues,
  type BookingPolicyPresetId,
} from "@beautonomi/i18n";
import { deriveEnforcementFields } from "@/app/api/provider/cancellation-policies/route";

const PRESET_POLICY_NAMES: Record<Exclude<BookingPolicyPresetId, "custom">, string> = {
  no_penalty: "No penalty",
  flexible: "Flexible",
  standard: "Standard",
  strict: "Strict",
};

export function resolveOnboardingBookingPolicyPreset(
  preset: BookingPolicyPresetId | undefined | null,
): Exclude<BookingPolicyPresetId, "custom"> {
  if (preset && preset !== "custom" && preset in BOOKING_POLICY_PRESETS) {
    return preset;
  }
  return "standard";
}

export function providerDepositFieldsFromPreset(preset: Exclude<BookingPolicyPresetId, "custom">) {
  const values = getPresetValues(preset);
  return {
    requires_deposit: values.requires_deposit,
    deposit_percentage: values.requires_deposit ? values.deposit_percentage : null,
    no_show_fee_enabled: values.no_show_fee_enabled,
    no_show_fee_amount: values.no_show_fee_enabled ? values.no_show_fee_amount : null,
  };
}

export function buildCancellationPolicyInsertFromPreset(
  providerId: string,
  preset: Exclude<BookingPolicyPresetId, "custom">,
) {
  const values = getPresetValues(preset);
  const name = PRESET_POLICY_NAMES[preset];
  const enforcement = deriveEnforcementFields({
    name,
    hours_before: values.hours_before,
    refund_percentage: values.refund_percentage,
  });

  return {
    provider_id: providerId,
    name,
    hours_before: values.hours_before,
    refund_percentage: values.refund_percentage,
    fee_amount: 0,
    fee_type: "fixed" as const,
    is_default: true,
    is_active: true,
    grace_window_minutes: values.grace_window_minutes,
    location_type: null,
    hours_before_cutoff: enforcement.hours_before_cutoff,
    late_cancellation_type: enforcement.late_cancellation_type,
    policy_text: enforcement.policy_text,
  };
}
