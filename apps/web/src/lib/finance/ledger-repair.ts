/**
 * Ledger Repair — maker-checker execution for `ledger_repair_proposals`.
 *
 *   admin_finance / superadmin  → propose (row status = proposed)
 *   superadmin (≠ proposer)     → approve  (status = approved → posted | approved+error)
 *
 * Approve posts through the existing money-correct helpers:
 *   - missing_online_charge_ledger → recordPaystackBookingSettlement
 *   - adjustment                   → postManualFinanceAdjustment
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { recordPaystackBookingSettlement } from "@/lib/bookings/record-paystack-booking-settlement";
import { checkPeriodLock } from "@/lib/finance/period-lock";
import { manualAdjustmentSchema, postManualFinanceAdjustment } from "@/lib/finance/post-manual-adjustment";

export const LEDGER_REPAIR_KINDS = ["missing_online_charge_ledger", "adjustment"] as const;
export type LedgerRepairKind = (typeof LEDGER_REPAIR_KINDS)[number];

export const missingOnlineChargeLedgerPayloadSchema = z.object({
  bookingId: z.string().uuid(),
  /** booking_payments.id — used for ledger attribution and duplicate protection. */
  bookingPaymentId: z.string().uuid().optional().nullable(),
  reference: z.string().min(3).max(200),
  amountMajor: z.number().positive(),
  /** Gateway fees in major units (R). */
  fees: z.number().min(0).default(0),
  isDeposit: z.boolean().default(false),
  walletAmountApplied: z.number().min(0).optional(),
  giftCardAmountApplied: z.number().min(0).optional(),
  customerEmail: z.string().email().optional().nullable(),
  feeSource: z.string().max(64).optional(),
});

export type MissingOnlineChargeLedgerPayload = z.infer<typeof missingOnlineChargeLedgerPayloadSchema>;

export const ledgerRepairProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("missing_online_charge_ledger"),
    payload: missingOnlineChargeLedgerPayloadSchema,
    note: z.string().max(2000).optional(),
  }),
  z.object({
    kind: z.literal("adjustment"),
    payload: manualAdjustmentSchema,
    note: z.string().max(2000).optional(),
  }),
]);

export type LedgerRepairProposalRow = {
  id: string;
  tenant_id: string | null;
  kind: LedgerRepairKind;
  payload: Record<string, unknown>;
  proposed_by: string;
  status: "proposed" | "approved" | "rejected" | "posted";
  approved_by: string | null;
  approved_at: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  posted_at: string | null;
  result?: Record<string, unknown> | null;
  error: string | null;
  note?: string | null;
  created_at: string;
};

export type ExecuteLedgerRepairResult =
  | { ok: true; result: Record<string, unknown>; skipped: boolean }
  | { ok: false; reason: string; code: "PERIOD_LOCKED" | "POST_FAILED" | "INVALID_PAYLOAD"; error?: unknown };

/**
 * Post the proposal's ledger effect. Does not mutate `ledger_repair_proposals`;
 * the caller records status/result/error.
 */
export async function executeLedgerRepairProposal(
  supabase: SupabaseClient,
  proposal: LedgerRepairProposalRow,
  ctx: { approvedBy: string },
): Promise<ExecuteLedgerRepairResult> {
  if (proposal.kind === "adjustment") {
    const parsed = manualAdjustmentSchema.safeParse(proposal.payload);
    if (!parsed.success) {
      return { ok: false, code: "INVALID_PAYLOAD", reason: parsed.error.issues[0]?.message ?? "invalid payload" };
    }
    const effectiveAt = parsed.data.effective_at ?? new Date().toISOString();
    const lock = await checkPeriodLock(supabase, proposal.tenant_id, effectiveAt);
    if (lock.locked) {
      return {
        ok: false,
        code: "PERIOD_LOCKED",
        reason: `effective_at ${effectiveAt.slice(0, 10)} falls inside a locked period (${lock.periodStart?.slice(0, 10)} – ${lock.periodEnd?.slice(0, 10)})`,
      };
    }
    if (!proposal.tenant_id) {
      return { ok: false, code: "INVALID_PAYLOAD", reason: "proposal has no tenant_id" };
    }
    const posted = await postManualFinanceAdjustment(supabase, {
      tenantId: proposal.tenant_id,
      input: parsed.data,
      createdBy: proposal.proposed_by,
      source: "admin_ledger_repair",
      proposalId: proposal.id,
      approvedBy: ctx.approvedBy,
    });
    if (posted.ok === false) {
      return { ok: false, code: "POST_FAILED", reason: posted.reason, error: posted.error };
    }
    return { ok: true, skipped: false, result: { adjustment: posted.adjustment } };
  }

  const parsed = missingOnlineChargeLedgerPayloadSchema.safeParse(proposal.payload);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_PAYLOAD", reason: parsed.error.issues[0]?.message ?? "invalid payload" };
  }

  // Ledger rows are posted "now"; respect a lock on the current period.
  const lock = await checkPeriodLock(supabase, proposal.tenant_id, new Date());
  if (lock.locked) {
    return {
      ok: false,
      code: "PERIOD_LOCKED",
      reason: `current period is locked (${lock.periodStart?.slice(0, 10)} – ${lock.periodEnd?.slice(0, 10)})`,
    };
  }

  const p = parsed.data;
  const settlement = await recordPaystackBookingSettlement(supabase, {
    bookingId: p.bookingId,
    reference: p.reference,
    amountMajor: p.amountMajor,
    feesSmallestOrMajor: p.fees,
    feesAlreadyMajor: true,
    feeSource: p.feeSource ?? "admin_ledger_repair",
    bookingPaymentId: p.bookingPaymentId ?? null,
    isDeposit: p.isDeposit,
    walletAmountApplied: p.walletAmountApplied,
    giftCardAmountApplied: p.giftCardAmountApplied,
    customerEmail: p.customerEmail ?? null,
    metadata: {
      source: "admin_ledger_repair",
      ledger_repair_proposal_id: proposal.id,
      proposed_by: proposal.proposed_by,
      approved_by: ctx.approvedBy,
    },
  });

  if (settlement.ok === false) {
    return {
      ok: false,
      code: "POST_FAILED",
      reason: `${settlement.stage}: ${settlement.reason}`,
      error: settlement.error,
    };
  }

  return {
    ok: true,
    skipped: settlement.ledger.skipped,
    result: {
      bookingPaymentId: settlement.bookingPaymentId,
      ledger: settlement.ledger,
      feesMajor: settlement.feesMajor,
      feeSource: settlement.feeSource,
    },
  };
}
