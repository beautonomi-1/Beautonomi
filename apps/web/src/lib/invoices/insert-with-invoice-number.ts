import type { SupabaseClient } from "@supabase/supabase-js";
import { nextDocumentNumber } from "@/lib/finance/document-number";

function isUniqueViolation(error: unknown): boolean {
  return String((error as { code?: string } | null)?.code ?? "") === "23505";
}

/**
 * Allocate the next invoice number and insert. Numbering goes through the
 * gap-free per-tenant sequence (`next_document_number`, F2-43) when deployed;
 * otherwise the legacy high-water read with retry on unique violation.
 */
export async function insertWithInvoiceNumber(
  supabase: SupabaseClient,
  year: number,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let lastError: unknown = null;
  const tenantId =
    typeof payload.tenant_id === "string" && payload.tenant_id ? (payload.tenant_id as string) : null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { number: invoiceNumber } = await nextDocumentNumber(supabase, {
      tenantId,
      kind: "provider_invoice",
      prefix: "INV",
      year,
      attempt,
      fallback: { table: "provider_invoices", column: "invoice_number" },
    });

    const { data, error } = await supabase
      .from("provider_invoices")
      .insert({ ...payload, invoice_number: invoiceNumber })
      .select()
      .single();

    if (!error && data) return data as Record<string, unknown>;
    if (!isUniqueViolation(error)) throw error;
    lastError = error;
  }

  throw lastError ?? new Error("Could not allocate a unique invoice number");
}
