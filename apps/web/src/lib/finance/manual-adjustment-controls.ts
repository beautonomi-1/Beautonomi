/**
 * F2-48 — bounds on manual finance adjustments.
 *
 *  - `hard_cap_major`: no single adjustment (|amount|, major units) may exceed
 *    this, whatever the role. Split it or fix the source transaction instead.
 *  - `direct_post_max_major`: a superadmin may post directly (no second
 *    approver) only up to this amount. Above it the adjustment becomes a
 *    `ledger_repair_proposals` row that a *different* superadmin must approve
 *    (maker-checker; see ledger-repair/[id]/approve).
 *  - Non-superadmin finance admins always go through maker-checker.
 *
 * Configuration — `platform_settings.settings.finance.manual_adjustments`:
 *
 *   { "direct_post_max_major": 5000, "hard_cap_major": 1000000 }
 */

export type ManualAdjustmentControls = {
  direct_post_max_major: number;
  hard_cap_major: number;
};

export const DEFAULT_MANUAL_ADJUSTMENT_CONTROLS: ManualAdjustmentControls = {
  direct_post_max_major: 5_000,
  hard_cap_major: 1_000_000,
};

export type ManualAdjustmentDecision =
  | { decision: "post" }
  | { decision: "propose"; reason: "maker_checker" | "over_direct_post_limit" }
  | { decision: "reject"; code: "ADJUSTMENT_OVER_CAP" | "INVALID_AMOUNT"; message: string };

export function readManualAdjustmentControls(
  settings: Record<string, unknown> | null | undefined,
): ManualAdjustmentControls {
  const out = { ...DEFAULT_MANUAL_ADJUSTMENT_CONTROLS };
  const finance = settings?.finance;
  if (!finance || typeof finance !== "object") return out;
  const raw = (finance as { manual_adjustments?: unknown }).manual_adjustments;
  if (!raw || typeof raw !== "object") return out;
  const row = raw as Record<string, unknown>;
  const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
  if (positive(row.direct_post_max_major)) out.direct_post_max_major = row.direct_post_max_major;
  if (positive(row.hard_cap_major)) out.hard_cap_major = row.hard_cap_major;
  return out;
}

export function evaluateManualAdjustment(params: {
  amount: number;
  role: string | null | undefined;
  controls: ManualAdjustmentControls;
}): ManualAdjustmentDecision {
  const abs = Math.abs(Number(params.amount));
  if (!Number.isFinite(abs) || abs === 0) {
    return { decision: "reject", code: "INVALID_AMOUNT", message: "Adjustment amount must be a non-zero finite number." };
  }
  if (abs > params.controls.hard_cap_major) {
    return {
      decision: "reject",
      code: "ADJUSTMENT_OVER_CAP",
      message: `Manual adjustments are capped at ${params.controls.hard_cap_major} per entry. Split the adjustment or correct the source transaction.`,
    };
  }
  if (params.role !== "superadmin") return { decision: "propose", reason: "maker_checker" };
  if (abs > params.controls.direct_post_max_major) {
    return { decision: "propose", reason: "over_direct_post_limit" };
  }
  return { decision: "post" };
}
