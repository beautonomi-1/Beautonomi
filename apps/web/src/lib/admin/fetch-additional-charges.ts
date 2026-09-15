import type { SupabaseClient } from "@supabase/supabase-js";

export type AdditionalChargeSummary = {
  id: string;
  description: string | null;
  amount: number | string | null;
  status: string | null;
};

export async function fetchAdditionalChargesByIds(
  supabase: SupabaseClient,
  chargeIds: string[],
): Promise<Map<string, AdditionalChargeSummary>> {
  const map = new Map<string, AdditionalChargeSummary>();
  const unique = [...new Set(chargeIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("additional_charges")
      .select("id, description, amount, status")
      .in("id", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as AdditionalChargeSummary[]) {
      map.set(String(row.id), row);
    }
  }
  return map;
}
