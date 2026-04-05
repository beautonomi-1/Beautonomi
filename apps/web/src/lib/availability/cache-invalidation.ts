import { revalidateTag } from "next/cache";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Invalidate the Next.js data cache for a specific staff member's availability
 * on a given date. Call after booking create/update/cancel.
 */
export async function invalidateAvailabilityCache(
  _supabase: SupabaseClient,
  staffId: string,
  date: string,
): Promise<void> {
  try {
    revalidateTag(`availability:${staffId}:${date}`, "default");
    revalidateTag(`availability:${staffId}`, "default");
  } catch {
    console.warn(`Cache invalidation failed for staff ${staffId} on ${date}`);
  }
}

export async function invalidateAvailabilityCacheRange(
  supabase: SupabaseClient,
  staffId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    await invalidateAvailabilityCache(supabase, staffId, dateStr);
  }
}

export async function broadcastAvailabilityUpdate(
  staffId: string,
  date: string,
  _providerId?: string,
): Promise<void> {
  try {
    revalidateTag(`availability:${staffId}:${date}`, "default");
  } catch {
    console.warn(`Broadcast invalidation failed for staff ${staffId} on ${date}`);
  }
}
