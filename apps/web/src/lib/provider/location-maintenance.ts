import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * If the provider has no primary among active locations, promote the oldest active row.
 */
export async function ensureProviderHasPrimaryLocation(
  supabase: SupabaseClient,
  providerId: string
): Promise<void> {
  const { data: primaries } = await supabase
    .from("provider_locations")
    .select("id")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .eq("is_primary", true)
    .limit(1);

  if (primaries && primaries.length > 0) return;

  const { data: next } = await supabase
    .from("provider_locations")
    .select("id")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const nextId = (next as { id?: string } | null)?.id;
  if (nextId) {
    await (supabase.from("provider_locations") as any).update({ is_primary: true }).eq("id", nextId);
  }
}

/** Mark one location primary and clear others for this provider. */
export async function setPrimaryLocation(
  supabase: SupabaseClient,
  providerId: string,
  locationId: string
): Promise<void> {
  await (supabase.from("provider_locations") as any)
    .update({ is_primary: false })
    .eq("provider_id", providerId)
    .neq("id", locationId);
  await (supabase.from("provider_locations") as any).update({ is_primary: true }).eq("id", locationId);
}

/**
 * New locations should appear in staff/location pickers: assign all active staff (service role; RLS on junction is owner-only for insert).
 */
export async function linkActiveStaffToNewLocation(
  providerId: string,
  locationId: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data: staffRows, error: staffErr } = await admin
    .from("provider_staff")
    .select("id")
    .eq("provider_id", providerId)
    .eq("is_active", true);

  if (staffErr || !staffRows?.length) return;

  const rows = staffRows.map((s: { id: string }) => ({
    staff_id: s.id,
    location_id: locationId,
    is_primary: false,
  }));

  const { error } = await (admin.from("provider_staff_locations") as any).upsert(rows, {
    onConflict: "staff_id,location_id",
  });

  if (error) {
    console.warn("linkActiveStaffToNewLocation:", error);
  }
}
