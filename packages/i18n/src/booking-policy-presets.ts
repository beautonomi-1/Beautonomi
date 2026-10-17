/**
 * Shared booking protection presets for onboarding and settings.
 */

export type BookingPolicyPresetId =
  | "no_penalty"
  | "flexible"
  | "standard"
  | "strict"
  | "custom";

export interface BookingPolicyPresetValues {
  hours_before: number;
  grace_window_minutes: number;
  refund_percentage: number;
  requires_deposit: boolean;
  deposit_percentage: number;
  no_show_fee_enabled: boolean;
  no_show_fee_amount: number;
}

export interface BookingPolicyPreset extends BookingPolicyPresetValues {
  id: BookingPolicyPresetId;
  labelKey: string;
}

export const BOOKING_POLICY_PRESETS: Record<
  Exclude<BookingPolicyPresetId, "custom">,
  BookingPolicyPreset
> = {
  no_penalty: {
    id: "no_penalty",
    labelKey: "provider.bookingPolicy.noPenalty",
    hours_before: 0,
    grace_window_minutes: 0,
    refund_percentage: 100,
    requires_deposit: false,
    deposit_percentage: 0,
    no_show_fee_enabled: false,
    no_show_fee_amount: 0,
  },
  flexible: {
    id: "flexible",
    labelKey: "provider.bookingPolicy.flexible",
    hours_before: 4,
    grace_window_minutes: 15,
    refund_percentage: 50,
    requires_deposit: false,
    deposit_percentage: 0,
    no_show_fee_enabled: false,
    no_show_fee_amount: 0,
  },
  standard: {
    id: "standard",
    labelKey: "provider.bookingPolicy.standard",
    hours_before: 24,
    grace_window_minutes: 15,
    refund_percentage: 50,
    requires_deposit: false,
    deposit_percentage: 0,
    no_show_fee_enabled: false,
    no_show_fee_amount: 0,
  },
  strict: {
    id: "strict",
    labelKey: "provider.bookingPolicy.strict",
    hours_before: 48,
    grace_window_minutes: 15,
    refund_percentage: 0,
    requires_deposit: true,
    deposit_percentage: 50,
    no_show_fee_enabled: true,
    no_show_fee_amount: 0,
  },
};

export const DEFAULT_BOOKING_POLICY_PRESET: Exclude<BookingPolicyPresetId, "custom"> = "standard";

export function getPresetValues(
  preset: BookingPolicyPresetId,
  overrides?: Partial<BookingPolicyPresetValues>,
): BookingPolicyPresetValues {
  const base =
    preset === "custom"
      ? BOOKING_POLICY_PRESETS.standard
      : BOOKING_POLICY_PRESETS[preset];
  return { ...base, ...overrides };
}

/** JSON stored on bookings.cancellation_policy_snapshot at insert time. */
export function buildPolicySnapshotJson(values: {
  policy_id?: string | null;
  hours_before_cutoff: number;
  grace_window_minutes: number;
  refund_percentage: number;
  fee_amount?: number;
  fee_type?: string;
  policy_text?: string;
  requires_deposit?: boolean;
  deposit_percentage?: number;
  no_show_fee_enabled?: boolean;
  no_show_fee_amount?: number;
}): Record<string, unknown> {
  return {
    policy_id: values.policy_id ?? null,
    hours_before_cutoff: values.hours_before_cutoff,
    grace_window_minutes: values.grace_window_minutes,
    refund_percentage: values.refund_percentage,
    fee_amount: values.fee_amount ?? 0,
    fee_type: values.fee_type ?? "fixed",
    policy_text: values.policy_text ?? null,
    requires_deposit: values.requires_deposit ?? false,
    deposit_percentage: values.deposit_percentage ?? 0,
    no_show_fee_enabled: values.no_show_fee_enabled ?? false,
    no_show_fee_amount: values.no_show_fee_amount ?? 0,
  };
}

export function standardPresetFallbackPolicy(providerId: string) {
  const s = BOOKING_POLICY_PRESETS.standard;
  return {
    id: "",
    provider_id: providerId,
    location_type: null as null,
    hours_before_cutoff: s.hours_before,
    grace_window_minutes: s.grace_window_minutes,
    policy_text:
      "Cancellations must be made at least 24 hours before your appointment. 50% refund if cancelled later.",
    late_cancellation_type: "partial_refund" as const,
    is_active: true,
    refund_percentage: s.refund_percentage,
    fee_amount: 0,
    fee_type: "fixed" as const,
  };
}
