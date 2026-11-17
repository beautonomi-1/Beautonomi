import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Insert earnings lines one at a time. The unique key includes the service id,
 * so PostgREST cannot target it with a three-column upsert. A duplicate (23505)
 * is the same as ignore-duplicates.
 */
export async function insertStaffEarningsLinesIgnoreDuplicates(
  admin: SupabaseClient,
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  let inserted = 0;
  for (const row of rows) {
    const { error } = await admin.from("staff_earnings_lines").insert(row);
    if (error?.code === "23505") continue;
    if (error) throw error;
    inserted += 1;
  }
  return inserted;
}
