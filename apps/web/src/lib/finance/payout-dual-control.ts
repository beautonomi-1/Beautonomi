/**
 * F2-20 — dual control for admin payouts (approve → initiate transfer).
 *
 * Rules
 *  1. The user who requested a payout can never approve it or move its money
 *     (`payouts.payout_account_details.requested_by`, written by
 *     POST /api/provider/payouts).
 *  2. At or above `threshold_major` (major currency units) the admin who
 *     initiates the transfer must be a *different* admin from the one who
 *     approved it (`payouts.approved_by`). Below the threshold a single finance
 *     admin may approve and transfer.
 *
 * Configuration — `platform_settings.settings.finance.payout_dual_control`:
 *
 *   {
 *     "enabled": true,            // false disables rule 2 only (rule 1 always applies)
 *     "threshold_major": 10000    // ≥ 0; 0 means "always require a second admin"
 *   }
 *
 * Tenant-scoped rows override the global (tenant_id IS NULL) row. Missing or
 * malformed values fall back to the defaults below, so an empty settings table
 * still enforces dual control.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PayoutDualControlSettings = {
  enabled: boolean;
  threshold_major: number;
};

export const DEFAULT_PAYOUT_DUAL_CONTROL: PayoutDualControlSettings = {
  enabled: true,
  threshold_major: 10_000,
};

export type PayoutDualControlDecision =
  | { ok: true }
  | {
      ok: false;
      code: "SELF_APPROVAL_FORBIDDEN" | "SECOND_APPROVER_REQUIRED";
      status: 403;
      message: string;
    };

export function readPayoutDualControlSettings(
  settings: Record<string, unknown> | null | undefined,
): PayoutDualControlSettings {
  const finance = settings?.finance;
  if (!finance || typeof finance !== "object") return { ...DEFAULT_PAYOUT_DUAL_CONTROL };
  const raw = (finance as { payout_dual_control?: unknown }).payout_dual_control;
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PAYOUT_DUAL_CONTROL };
  const row = raw as Record<string, unknown>;
  const out = { ...DEFAULT_PAYOUT_DUAL_CONTROL };
  if (typeof row.enabled === "boolean") out.enabled = row.enabled;
  if (typeof row.threshold_major === "number" && Number.isFinite(row.threshold_major) && row.threshold_major >= 0) {
    out.threshold_major = row.threshold_major;
  }
  return out;
}

async function fetchSettingsRow(
  supabase: SupabaseClient,
  tenantId: string | null,
): Promise<Record<string, unknown> | null> {
  let q = supabase
    .from("platform_settings")
    .select("id, settings")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  q = tenantId == null ? q.is("tenant_id", null) : q.eq("tenant_id", tenantId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return ((data as { settings?: Record<string, unknown> | null } | null)?.settings ?? null) as
    | Record<string, unknown>
    | null;
}

/** Tenant row wins over global row; any read failure → defaults (never "disabled"). */
export async function resolvePayoutDualControlSettings(
  supabase: SupabaseClient,
  tenantId: string | null,
): Promise<PayoutDualControlSettings> {
  try {
    const tenantSettings = tenantId ? await fetchSettingsRow(supabase, tenantId) : null;
    const tenantRaw = tenantSettings
      ? ((tenantSettings.finance as Record<string, unknown> | undefined)?.payout_dual_control as
          | Record<string, unknown>
          | undefined)
      : undefined;
    const globalSettings = await fetchSettingsRow(supabase, null);
    const base = readPayoutDualControlSettings(globalSettings);
    if (!tenantRaw) return base;
    const override = readPayoutDualControlSettings(tenantSettings);
    return {
      enabled: typeof tenantRaw.enabled === "boolean" ? override.enabled : base.enabled,
      threshold_major:
        typeof tenantRaw.threshold_major === "number" ? override.threshold_major : base.threshold_major,
    };
  } catch (err) {
    console.warn("[payout-dual-control] settings lookup failed; using defaults", {
      message: err instanceof Error ? err.message : String(err),
    });
    return { ...DEFAULT_PAYOUT_DUAL_CONTROL };
  }
}

export function readRequestedBy(payoutAccountDetails: unknown): string | null {
  if (!payoutAccountDetails || typeof payoutAccountDetails !== "object") return null;
  const v = (payoutAccountDetails as { requested_by?: unknown }).requested_by;
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function evaluatePayoutApproval(params: {
  actorId: string;
  requestedBy: string | null | undefined;
}): PayoutDualControlDecision {
  if (params.requestedBy && params.requestedBy === params.actorId) {
    return {
      ok: false,
      code: "SELF_APPROVAL_FORBIDDEN",
      status: 403,
      message: "Dual control: the user who requested a payout cannot approve it.",
    };
  }
  return { ok: true };
}

export function evaluatePayoutTransfer(params: {
  actorId: string;
  approvedBy: string | null | undefined;
  requestedBy: string | null | undefined;
  amount: number;
  settings: PayoutDualControlSettings;
}): PayoutDualControlDecision {
  if (params.requestedBy && params.requestedBy === params.actorId) {
    return {
      ok: false,
      code: "SELF_APPROVAL_FORBIDDEN",
      status: 403,
      message: "Dual control: the user who requested a payout cannot initiate its transfer.",
    };
  }
  if (!params.settings.enabled) return { ok: true };
  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount < params.settings.threshold_major) return { ok: true };
  if (!params.approvedBy || params.approvedBy === params.actorId) {
    return {
      ok: false,
      code: "SECOND_APPROVER_REQUIRED",
      status: 403,
      message: `Dual control: payouts of ${params.settings.threshold_major} or more must be transferred by a different finance admin from the one who approved them.`,
    };
  }
  return { ok: true };
}
