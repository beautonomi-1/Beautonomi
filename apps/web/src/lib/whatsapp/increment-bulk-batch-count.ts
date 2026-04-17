import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Atomically best-effort increment of a counter on whatsapp_bulk_batches (read + write).
 * Used when no DB RPC is available for increment.
 */
export async function incrementBulkBatchCount(
  supabase: SupabaseClient,
  batchId: string,
  field: "sent_count" | "failed_count" | "delivered_count",
): Promise<void> {
  const { data: row, error: selErr } = await supabase
    .from("whatsapp_bulk_batches")
    .select(field)
    .eq("id", batchId)
    .maybeSingle();
  if (selErr) {
    console.warn(`[whatsapp_bulk_batches] read ${field} failed:`, selErr);
    return;
  }
  const cur = Number((row as Record<string, unknown> | null)?.[field] ?? 0);
  const { error: upErr } = await supabase
    .from("whatsapp_bulk_batches")
    .update({ [field]: cur + 1 })
    .eq("id", batchId);
  if (upErr) {
    console.warn(`[whatsapp_bulk_batches] update ${field} failed:`, upErr);
  }
}
