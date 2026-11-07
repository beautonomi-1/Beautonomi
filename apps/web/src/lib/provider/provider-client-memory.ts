import type { SupabaseClient } from "@supabase/supabase-js";

export type ProviderClientMemory = {
  last_booking_id: string | null;
  last_offering_name: string | null;
  last_staff_name: string | null;
  service_note: string | null;
  explore_post_id: string | null;
};

export async function fetchProviderClientMemory(
  supabase: SupabaseClient,
  providerId: string,
  customerId: string | null | undefined,
): Promise<ProviderClientMemory | null> {
  if (!customerId) return null;

  const { data: row } = await supabase
    .from("provider_clients")
    .select("last_booking_id, last_offering_name, last_staff_name, service_note")
    .eq("provider_id", providerId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (!row) return null;

  let explorePostId: string | null = null;
  const lastBookingId = (row as { last_booking_id?: string | null }).last_booking_id ?? null;
  if (lastBookingId) {
    const { data: post } = await supabase
      .from("explore_posts")
      .select("id")
      .eq("provider_id", providerId)
      .eq("source_booking_id", lastBookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    explorePostId = (post as { id?: string } | null)?.id ?? null;
  }

  return {
    last_booking_id: lastBookingId,
    last_offering_name: (row as { last_offering_name?: string | null }).last_offering_name ?? null,
    last_staff_name: (row as { last_staff_name?: string | null }).last_staff_name ?? null,
    service_note: (row as { service_note?: string | null }).service_note ?? null,
    explore_post_id: explorePostId,
  };
}
