/**
 * Shared writer for controlled manual finance adjustments.
 *
 * Used by:
 *  - POST /api/admin/finance/adjustments (superadmin direct post)
 *  - Ledger Repair approve step (admin_finance proposes → superadmin approves)
 *
 * Never call this without a period-lock check (`checkPeriodLock`) upstream.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const manualAdjustmentSchema = z.object({
  amount: z.number().refine((v) => Number.isFinite(v) && v !== 0, "amount must be a non-zero number"),
  description: z.string().min(3).max(500),
  effective_at: z.string().datetime().optional(),
  adjustment_code: z.string().min(2).max(64).optional(),
  provider_id: z.string().uuid().optional().nullable(),
  booking_id: z.string().uuid().optional().nullable(),
  currency: z.string().length(3).optional(),
});

export type ManualAdjustmentInput = z.infer<typeof manualAdjustmentSchema>;

export type PostedManualAdjustment = {
  id: string;
  amount: number;
  net: number;
  description: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

export type PostManualAdjustmentResult =
  | { ok: true; adjustment: PostedManualAdjustment }
  | { ok: false; reason: string; error?: unknown };

export async function postManualFinanceAdjustment(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    input: ManualAdjustmentInput;
    createdBy: string;
    source: "admin_finance_adjustment" | "admin_ledger_repair";
    proposalId?: string | null;
    approvedBy?: string | null;
  },
): Promise<PostManualAdjustmentResult> {
  const effectiveAt = params.input.effective_at ?? new Date().toISOString();
  const amount = Number(params.input.amount);
  const description = params.input.description.trim();
  const adjustmentCode = params.input.adjustment_code?.trim() || "MANUAL_ADJUSTMENT";

  const metadata: Record<string, unknown> = {
    adjustment_code: adjustmentCode,
    created_by: params.createdBy,
    source: params.source,
  };
  if (params.proposalId) metadata.ledger_repair_proposal_id = params.proposalId;
  if (params.approvedBy) metadata.approved_by = params.approvedBy;

  const insertRow: Record<string, unknown> = {
    tenant_id: params.tenantId,
    transaction_type: "manual_adjustment",
    amount,
    net: amount,
    fees: 0,
    commission: 0,
    description,
    created_at: effectiveAt,
    metadata,
  };
  if (params.input.provider_id) insertRow.provider_id = params.input.provider_id;
  if (params.input.booking_id) insertRow.booking_id = params.input.booking_id;
  if (params.input.currency) insertRow.currency = params.input.currency.toUpperCase();

  const { data, error } = await supabase
    .from("finance_transactions")
    .insert(insertRow)
    .select("id, amount, net, description, created_at, metadata")
    .single();

  if (error || !data) {
    return { ok: false, reason: error?.message ?? "insert_failed", error };
  }

  return { ok: true, adjustment: data as PostedManualAdjustment };
}
