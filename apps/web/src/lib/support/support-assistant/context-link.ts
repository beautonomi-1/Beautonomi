import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecentSupportRecordSummary } from "@/lib/agents/support-context";
import { attachSupportContextToTicket } from "@/lib/support/attach-support-context";
import { categoryExpectsLinkableRecord } from "./categories";

const BOOKING_REF = /\b([A-Z]{2,5}-?\d{4,})\b/i;
const ORDER_REF = /\b(ORD[-\s]?[A-Z0-9]{4,})\b/i;

export type AssistantLinkRecordHint = {
  link_booking_number?: string | null;
  link_order_number?: string | null;
  link_booking_id?: string | null;
  link_order_id?: string | null;
};

/** Try to attach booking/order when the ticket has no linked id yet. */
export async function tryAutoLinkSupportContextForAssistant(params: {
  admin: SupabaseClient;
  ticketId: string;
  ticket: {
    user_id: string;
    provider_id?: string | null;
    category?: string | null;
    support_context_id?: string | null;
  };
  userText: string;
  llmHint?: AssistantLinkRecordHint | null;
  recentRecords?: RecentSupportRecordSummary[];
}): Promise<boolean> {
  if (params.ticket.support_context_id) return false;
  if (!categoryExpectsLinkableRecord(String(params.ticket.category ?? ""))) return false;

  const input: {
    booking_number?: string;
    order_number?: string;
    booking_id?: string;
    order_id?: string;
  } = {};

  const hint = params.llmHint ?? {};
  if (hint.link_booking_id) input.booking_id = String(hint.link_booking_id);
  else if (hint.link_booking_number) input.booking_number = String(hint.link_booking_number).trim();
  else if (hint.link_order_id) input.order_id = String(hint.link_order_id);
  else if (hint.link_order_number) input.order_number = String(hint.link_order_number).trim();
  else {
    const bookingMatch = params.userText.match(BOOKING_REF);
    const orderMatch = params.userText.match(ORDER_REF);
    if (bookingMatch?.[1]) input.booking_number = bookingMatch[1].trim();
    else if (orderMatch?.[1]) input.order_number = orderMatch[1].replace(/\s+/g, "").trim();
    else if (params.recentRecords?.length === 1) {
      const only = params.recentRecords[0]!;
      if (only.kind === "booking") input.booking_id = only.id;
      else input.order_id = only.id;
    }
  }

  if (!input.booking_number && !input.order_number && !input.booking_id && !input.order_id) {
    return false;
  }

  const result = await attachSupportContextToTicket({
    admin: params.admin,
    ticketId: params.ticketId,
    ticket: { user_id: String(params.ticket.user_id), provider_id: params.ticket.provider_id },
    input,
  });
  return result.ok;
}
