import type { SupabaseClient } from "@supabase/supabase-js";

/** Postgres unique_violation — duplicate `payment_transactions(provider, reference)`, webhook ledger row, etc. */
export function isPostgresUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined;
  if (!e) return false;
  if (e.code === "23505") return true;
  const m = e.message ?? "";
  return m.includes("unique") || m.includes("duplicate");
}

/**
 * Record a processed PSP webhook idempotently (spec §10). Returns false if duplicate key (already processed).
 */
export async function tryRecordPaymentWebhookEvent(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    provider: string;
    idempotencyKey: string;
    payloadHash?: string | null;
    status?: "processed" | "failed" | "ignored";
  }
): Promise<{ inserted: boolean }> {
  const { error } = await supabase.from("payment_webhook_events").insert({
    tenant_id: params.tenantId,
    provider: params.provider,
    idempotency_key: params.idempotencyKey,
    payload_hash: params.payloadHash ?? null,
    status: params.status ?? "processed",
  });
  if (error?.code === "23505") {
    return { inserted: false };
  }
  if (error) {
    throw error;
  }
  return { inserted: true };
}
