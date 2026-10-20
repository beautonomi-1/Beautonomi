import type { SupabaseClient } from "@supabase/supabase-js";
import { handoffSupportTicketToHuman } from "./handoff";

const STALE_CUSTOMER_MESSAGE_MS = 3 * 60 * 1000;
const IN_FLIGHT_STALE_MS = 2 * 60 * 1000;

export async function handoffStaleSupportAssistantTickets(admin: SupabaseClient): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_CUSTOMER_MESSAGE_MS).toISOString();
  const inFlightSince = new Date(Date.now() - IN_FLIGHT_STALE_MS).toISOString();

  const { data: tickets } = await admin
    .from("support_tickets")
    .select("id")
    .eq("handling_mode", "assistant")
    .in("status", ["open", "in_progress", "waiting_customer"])
    .eq("last_message_from", "customer")
    .lt("last_message_at", staleBefore)
    .limit(50);

  let handedOff = 0;
  for (const row of tickets ?? []) {
    const ticketId = String((row as { id: string }).id);
    const running = await admin
      .from("agent_runs")
      .select("id")
      .eq("workflow_type", "support-assistant")
      .eq("correlation_id", ticketId)
      .eq("status", "running")
      .gte("started_at", inFlightSince)
      .limit(1);
    if ((running.data ?? []).length > 0) continue;

    await handoffSupportTicketToHuman({
      admin,
      ticketId,
      reason: "Assistant reply not delivered",
    });
    handedOff += 1;
  }
  return handedOff;
}
