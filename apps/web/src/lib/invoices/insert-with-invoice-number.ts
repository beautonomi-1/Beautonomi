import type { SupabaseClient } from "@supabase/supabase-js";

function isUniqueViolation(error: unknown): boolean {
  return String((error as { code?: string } | null)?.code ?? "") === "23505";
}

export async function insertWithInvoiceNumber(
  supabase: SupabaseClient,
  year: number,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: lastInvoice } = await supabase
      .from("provider_invoices")
      .select("invoice_number")
      .like("invoice_number", `INV-${year}-%`)
      .order("invoice_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    let sequenceNum = 1;
    const lastNumber = (lastInvoice as { invoice_number?: string } | null)?.invoice_number;
    if (lastNumber) {
      const match = lastNumber.match(/INV-\d{4}-(\d+)/);
      if (match) sequenceNum = parseInt(match[1], 10) + 1;
    }
    sequenceNum += attempt;

    const invoiceNumber = `INV-${year}-${sequenceNum.toString().padStart(6, "0")}`;
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
