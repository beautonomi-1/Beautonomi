import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * F2-43 — gap-free, per-tenant document numbering (invoices, payouts, payments).
 *
 * SARS expects tax-invoice numbers to be sequential without gaps. A
 * "SELECT max()+1 then INSERT" race leaves gaps and duplicates, so numbers
 * must be allocated by the database under a row lock.
 *
 * TODO(DB agent): create the RPC
 *   `public.next_document_number(p_tenant_id uuid, p_kind text) RETURNS bigint`
 *   backed by a `document_sequences(tenant_id uuid, kind text, last_value bigint,
 *   PRIMARY KEY (tenant_id, kind))` table, implemented as
 *   `INSERT … ON CONFLICT (tenant_id, kind) DO UPDATE SET last_value =
 *   document_sequences.last_value + 1 RETURNING last_value` (SECURITY DEFINER,
 *   EXECUTE revoked from PUBLIC/anon/authenticated, service_role only). `p_kind`
 *   is `<document kind>:<year>` so numbering restarts each calendar year.
 *
 * Until that RPC is deployed this helper falls back to the legacy high-water
 * read; callers must still retry on unique violation (23505).
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
  const { data, error } = await supabase.rpc(NEXT_DOCUMENT_NUMBER_RPC, {
    p_tenant_id: input.tenantId,
    p_kind: `${input.kind}:${input.year}`,
  });
  if (!error) {
    const sequence = Number(Array.isArray(data) ? data[0] : data);
    if (Number.isFinite(sequence) && sequence > 0) {
      return { number: formatDocumentNumber(input.prefix, input.year, sequence), sequence, source: "rpc" };
    }
  } else if (!isMissingRpc(error)) {
    throw error;
  }

  // Fallback (not gap-free under concurrency — see TODO above).
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
