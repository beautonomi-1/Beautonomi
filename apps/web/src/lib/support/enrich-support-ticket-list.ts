import type { SupabaseClient } from "@supabase/supabase-js";

/** Latest public staff reply delivery status for email-channel tickets (queue badge). */
export async function enrichTicketsWithLatestEmailDeliveryStatus<
  T extends { id: string; channel?: string | null },
>(supabase: SupabaseClient, tickets: T[]): Promise<(T & { latest_public_email_delivery_status?: string | null })[]> {
  const emailTicketIds = tickets.filter((t) => t.channel === "email").map((t) => t.id);
  if (emailTicketIds.length === 0) return tickets;

  const { data, error } = await supabase
    .from("support_ticket_messages")
    .select("ticket_id, email_delivery_status, created_at, user_id, is_internal")
    .in("ticket_id", emailTicketIds)
    .eq("is_internal", false)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const latestByTicket = new Map<string, string | null>();
  for (const row of data ?? []) {
    const tid = (row as { ticket_id?: string }).ticket_id;
    const status = (row as { email_delivery_status?: string | null }).email_delivery_status;
    if (!tid || latestByTicket.has(tid)) continue;
    if (status == null) continue;
    latestByTicket.set(tid, status);
  }

  return tickets.map((t) => ({
    ...t,
    latest_public_email_delivery_status: latestByTicket.get(t.id) ?? null,
  }));
}
