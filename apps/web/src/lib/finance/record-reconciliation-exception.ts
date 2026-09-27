import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordReconciliationException(params: {
  supabase: SupabaseClient;
  tenantId: string;
  currency: string;
  psp: string;
  mismatchReason: string;
  externalId?: string | null;
  internalId?: string | null;
  amount?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { supabase, tenantId, currency, psp, mismatchReason } = params;
  await supabase.from("reconciliation_exceptions").insert({
    tenant_id: tenantId,
    currency,
    psp,
    source: "psp",
    external_id: params.externalId ?? null,
    internal_id: params.internalId ?? null,
    amount: params.amount ?? null,
    status: "open",
    mismatch_reason: mismatchReason.slice(0, 2000),
    metadata: params.metadata ?? {},
  });
}
