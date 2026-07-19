/**
 * Three-way reconciliation engine (ledger ↔ PSP ↔ bank).
 * Phase 12 foundation — cron connectors enqueue exceptions into reconciliation_exceptions.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReconciliationMatchInput = {
  tenantId: string;
  currency: string;
  psp: string;
  ledgerAmount: number;
  pspAmount: number;
  bankAmount?: number;
  ledgerId?: string;
  pspExternalId?: string;
  toleranceMinorUnits?: number;
};

export function amountsWithinTolerance(
  a: number,
  b: number,
  tolerance = 0.01,
): boolean {
  return Math.abs(a - b) <= tolerance;
}

export async function recordReconciliationException(
  supabase: SupabaseClient,
  input: ReconciliationMatchInput & { reason: string; source: "ledger" | "psp" | "bank" },
): Promise<void> {
  await supabase.from("reconciliation_exceptions").insert({
    tenant_id: input.tenantId,
    currency: input.currency,
    psp: input.psp,
    source: input.source,
    external_id: input.pspExternalId ?? null,
    internal_id: input.ledgerId ?? null,
    amount: input.pspAmount,
    mismatch_reason: input.reason,
    metadata: {
      ledger_amount: input.ledgerAmount,
      psp_amount: input.pspAmount,
      bank_amount: input.bankAmount ?? null,
    },
  });
}

export async function runThreeWayMatch(
  supabase: SupabaseClient,
  input: ReconciliationMatchInput,
): Promise<"matched" | "exception"> {
  const ledgerPspOk = amountsWithinTolerance(input.ledgerAmount, input.pspAmount);
  const bankOk =
    input.bankAmount == null || amountsWithinTolerance(input.pspAmount, input.bankAmount);

  if (ledgerPspOk && bankOk) return "matched";

  await recordReconciliationException(supabase, {
    ...input,
    source: "psp",
    reason: !ledgerPspOk ? "ledger_psp_mismatch" : "psp_bank_mismatch",
  });
  return "exception";
}
