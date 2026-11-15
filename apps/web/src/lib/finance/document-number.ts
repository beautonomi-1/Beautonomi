import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * F2-43 — gap-free, per-tenant document numbering (invoices, payouts, payments).
 *
 * SARS expects tax-invoice numbers to be sequential. Allocation is
 * `next_document_number(tenant, kind, prefix)` (migration 10140), which locks
 * `document_sequences` and returns the full number, for example
 * `INV-2026-000001`. The year bucket is the database's Johannesburg year.
 *
 * When the function is not deployed yet, or the row has no tenant, this falls
 * back to a high-water read. Callers still retry on unique violation (23505).
 */
export const NEXT_DOCUMENT_NUMBER_RPC = "next_document_number";

export type DocumentKind = "provider_invoice" | "payout" | "payment";

export function formatDocumentNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(6, "0")}`;
}

function isMissingRpc(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code ?? "");
  const message = String((error as { message?: string } | null)?.message ?? "");
  return (
    code === "42883" || // undefined_function
    code === "PGRST202" || // PostgREST: function not found in schema cache
    /could not find the function|does not exist/i.test(message)
  );
}

function sequenceFromDocumentNumber(value: string): number | null {
  const match = value.match(/-(\d+)$/);
  if (!match) return null;
  const sequence = parseInt(match[1]!, 10);
  return Number.isFinite(sequence) && sequence > 0 ? sequence : null;
}

export async function nextDocumentNumber(
  supabase: SupabaseClient,
  input: {
    tenantId: string | null;
    kind: DocumentKind;
    prefix: string;
    year: number;
    /** Retry counter from the caller's unique-violation loop (fallback path only). */
    attempt?: number;
    fallback: { table: string; column: string };
  },
): Promise<{ number: string; sequence: number; source: "rpc" | "fallback" }> {
  if (input.tenantId) {
    const { data, error } = await supabase.rpc(NEXT_DOCUMENT_NUMBER_RPC, {
      p_tenant_id: input.tenantId,
      p_kind: input.kind,
      p_prefix: input.prefix,
    });
    if (!error) {
      const raw = Array.isArray(data) ? data[0] : data;
      if (typeof raw === "string") {
        const sequence = sequenceFromDocumentNumber(raw);
        if (sequence) return { number: raw, sequence, source: "rpc" };
      }
      const sequence = Number(raw);
      if (Number.isFinite(sequence) && sequence > 0) {
        return {
          number: formatDocumentNumber(input.prefix, input.year, sequence),
          sequence,
          source: "rpc",
        };
      }
    } else if (!isMissingRpc(error)) {
      throw error;
    }
  }

  // Fallback when the sequence function is not deployed, or the row has no tenant.
  const { data: last } = await supabase
    .from(input.fallback.table)
    .select(input.fallback.column)
    .like(input.fallback.column, `${input.prefix}-${input.year}-%`)
    .order(input.fallback.column, { ascending: false })
    .limit(1)
    .maybeSingle();

  let sequence = 1;
  const lastNumber = (last as unknown as Record<string, unknown> | null)?.[input.fallback.column];
  if (typeof lastNumber === "string") {
    const match = lastNumber.match(/-(\d{4})-(\d+)$/);
    if (match) sequence = parseInt(match[2]!, 10) + 1;
  }
  sequence += input.attempt ?? 0;
  return { number: formatDocumentNumber(input.prefix, input.year, sequence), sequence, source: "fallback" };
}
