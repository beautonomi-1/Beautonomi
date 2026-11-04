import type { SupabaseClient } from "@supabase/supabase-js";

export type MeGroupAccess = {
  isPrimary: boolean;
  /** booking_participants.id rows that belong to the signed-in user. */
  ownParticipantIds: string[];
};

/** How the signed-in customer relates to a group booking (null when not a member). */
export async function resolveMeGroupAccess(
  admin: SupabaseClient,
  groupBookingId: string,
  userId: string,
): Promise<MeGroupAccess | null> {
  const { data: group } = await admin
    .from("group_bookings")
    .select("id, primary_contact_booking_id")
    .eq("id", groupBookingId)
    .maybeSingle();
  if (!group) return null;

  const leadId = (group as { primary_contact_booking_id?: string | null }).primary_contact_booking_id;
  let leadCustomerId: string | null = null;
  if (leadId) {
    const { data: lead } = await admin
      .from("bookings")
      .select("customer_id")
      .eq("id", leadId)
      .maybeSingle();
    leadCustomerId = (lead as { customer_id?: string | null } | null)?.customer_id ?? null;
  }

  const { data: rows } = await admin
    .from("booking_participants")
    .select("id, is_primary_contact, customer_id")
    .eq("group_booking_id", groupBookingId)
    .eq("customer_id", userId);
  const own = (rows ?? []) as Array<{ id: string; is_primary_contact?: boolean }>;
  const isPrimary = leadCustomerId === userId || own.some((r) => r.is_primary_contact);
  if (!isPrimary && own.length === 0) return null;
  return { isPrimary, ownParticipantIds: own.map((r) => r.id) };
}

export function normalizeGroupBookingId(rawId: string): string {
  return rawId.startsWith("group:") ? rawId.slice("group:".length) : rawId;
}
