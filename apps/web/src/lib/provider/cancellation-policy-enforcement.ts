/** Map UI "both" to NULL (applies to all locations). */
export function normalizePolicyLocationType(
  locationType: "at_salon" | "at_home" | "both" | null | undefined,
): "at_salon" | "at_home" | null {
  if (locationType === "both" || locationType === undefined) return null;
  return locationType;
}

/** Derive enforcement columns from provider-set fields for cancellation_policies. */
export function deriveEnforcementFields(data: {
  name: string;
  hours_before: number;
  refund_percentage: number;
}): {
  hours_before_cutoff: number;
  late_cancellation_type: "no_refund" | "partial_refund" | "full_refund";
  policy_text: string;
} {
  const late_cancellation_type =
    data.refund_percentage === 0
      ? ("no_refund" as const)
      : data.refund_percentage === 100
        ? ("full_refund" as const)
        : ("partial_refund" as const);
  let policy_text: string;
  if (data.hours_before <= 0 && data.refund_percentage >= 100) {
    policy_text = "Free cancellation anytime before your appointment.";
  } else if (data.hours_before <= 0) {
    policy_text = `${data.refund_percentage}% refund if you cancel before your appointment.`;
  } else if (data.refund_percentage >= 100) {
    policy_text = `Free cancellation up to ${data.hours_before} hours before your appointment.`;
  } else {
    policy_text = `Cancellations must be made at least ${data.hours_before} hours before your appointment. ${data.refund_percentage}% refund if cancelled later.`;
  }
  return {
    hours_before_cutoff: data.hours_before,
    late_cancellation_type,
    policy_text,
  };
}
