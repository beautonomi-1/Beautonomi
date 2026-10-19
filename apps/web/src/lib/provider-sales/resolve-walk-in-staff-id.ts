import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve `product_orders.staff_id` (FK → provider_staff.id) for walk-in sales.
 * Never returns a raw users.id.
 */
export async function resolveWalkInStaffId(
  admin: SupabaseClient,
  providerId: string,
  userId: string,
  explicitStaffId?: string | null,
): Promise<string | null> {
  if (explicitStaffId) {
    const { data: row } = await admin
      .from("provider_staff")
      .select("id")
      .eq("id", explicitStaffId)
      .eq("provider_id", providerId)
      .maybeSingle();
    return row?.id ?? null;
  }

  const { data: activeRow } = await admin
    .from("provider_staff")
    .select("id")
    .eq("provider_id", providerId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (activeRow?.id) return activeRow.id as string;

  const { data: anyRow } = await admin
    .from("provider_staff")
    .select("id")
    .eq("provider_id", providerId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (anyRow?.id as string | undefined) ?? null;
}
