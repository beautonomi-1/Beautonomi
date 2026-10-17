import type { CancellationPolicyView } from "@beautonomi/i18n";

export function buildPublicPolicyView(input: {
  policy?: {
    hours_before?: number | null;
    hours_before_cutoff?: number | null;
    grace_window_minutes?: number | null;
    refund_percentage?: number | null;
    policy_text?: string | null;
  } | null;
  provider?: {
    requires_deposit?: boolean | null;
    deposit_percentage?: number | null;
    no_show_fee_enabled?: boolean | null;
    no_show_fee_amount?: number | null;
    currency?: string | null;
  } | null;
}): CancellationPolicyView {
  const p = input.policy;
  const prov = input.provider;
  const windowH =
    p?.hours_before ?? p?.hours_before_cutoff ?? null;
  return {
    cancellationWindowHours: windowH != null ? Number(windowH) : null,
    graceWindowMinutes:
      p?.grace_window_minutes != null ? Number(p.grace_window_minutes) : null,
    lateRefundPercentage:
      p?.refund_percentage != null ? Number(p.refund_percentage) : null,
    noShowFeeEnabled: Boolean(prov?.no_show_fee_enabled),
    noShowFeeAmount:
      prov?.no_show_fee_amount != null ? Number(prov.no_show_fee_amount) : null,
    currency: prov?.currency ?? null,
    policyText: p?.policy_text ?? null,
  };
}
