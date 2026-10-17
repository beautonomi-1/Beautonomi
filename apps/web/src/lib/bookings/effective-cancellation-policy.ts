import type { CancellationPolicy } from "@/lib/bookings/cancellation-policy";

export type CancellationPolicySnapshot = {
  policy_id?: string | null;
  hours_before_cutoff?: number;
  grace_window_minutes?: number;
  refund_percentage?: number;
  fee_amount?: number;
  fee_type?: string;
  policy_text?: string;
  no_show_fee_enabled?: boolean;
  no_show_fee_amount?: number;
};

/** Merge snapshot with live policy — always the more customer-friendly value. */
export function mergeEffectiveCancellationPolicy(
  snapshot: CancellationPolicySnapshot | null | undefined,
  live: CancellationPolicy | null,
  providerNoShow?: { enabled: boolean; amount: number },
): CancellationPolicy & {
  no_show_fee_enabled: boolean;
  no_show_fee_amount: number;
} {
  const base = live ?? {
    id: "",
    provider_id: "",
    location_type: null,
    hours_before_cutoff: 24,
    grace_window_minutes: 15,
    policy_text: "",
    late_cancellation_type: "partial_refund" as const,
    is_active: true,
    refund_percentage: 50,
    fee_amount: 0,
    fee_type: "fixed" as const,
  };

  const snap = snapshot ?? {};
  const hours = Math.min(
    base.hours_before_cutoff,
    snap.hours_before_cutoff ?? base.hours_before_cutoff,
  );
  const grace = Math.max(
    base.grace_window_minutes,
    snap.grace_window_minutes ?? base.grace_window_minutes,
  );
  const refundPct = Math.max(
    base.refund_percentage ?? 0,
    snap.refund_percentage ?? base.refund_percentage ?? 0,
  );

  const snapNoShowOn = Boolean(snap.no_show_fee_enabled);
  const liveNoShowOn = Boolean(providerNoShow?.enabled);
  const noShowEnabled = snapNoShowOn && liveNoShowOn;
  const noShowAmount = noShowEnabled
    ? Math.min(
        Number(snap.no_show_fee_amount ?? providerNoShow?.amount ?? 0),
        Number(providerNoShow?.amount ?? snap.no_show_fee_amount ?? 0),
      )
    : 0;

  return {
    ...base,
    hours_before_cutoff: hours,
    hours_before: hours,
    grace_window_minutes: grace,
    refund_percentage: refundPct,
    fee_amount: Math.min(Number(base.fee_amount ?? 0), Number(snap.fee_amount ?? base.fee_amount ?? 0)),
    fee_type: (snap.fee_type as CancellationPolicy["fee_type"]) ?? base.fee_type,
    policy_text: snap.policy_text ?? base.policy_text,
    late_cancellation_type:
      refundPct >= 100
        ? "full_refund"
        : refundPct <= 0
          ? "no_refund"
          : "partial_refund",
    no_show_fee_enabled: noShowEnabled,
    no_show_fee_amount: noShowAmount,
  };
}

export function snapshotFromJson(raw: unknown): CancellationPolicySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as CancellationPolicySnapshot;
}
