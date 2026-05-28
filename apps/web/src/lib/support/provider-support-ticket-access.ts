import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  notFoundResponse,
  userHasProviderAccessAdmin,
} from "@/lib/supabase/api-helpers";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;
type ApiErrorResponse = ReturnType<typeof errorResponse>;

export const PROVIDER_SUPPORT_TICKET_LIST_SELECT = `
  id,
  ticket_number,
  subject,
  status,
  priority,
  category,
  provider_id,
  requester_type,
  support_context_type,
  support_context_id,
  support_context_label,
  csat_score,
  csat_submitted_at,
  last_message_at,
  last_message_from,
  last_customer_view_at,
  created_at,
  updated_at
`;

export const PROVIDER_SUPPORT_TICKET_DETAIL_SELECT = `
  id,
  ticket_number,
  subject,
  description,
  status,
  priority,
  category,
  provider_id,
  user_id,
  requester_type,
  support_context_type,
  support_context_id,
  support_context_label,
  csat_score,
  csat_comment,
  csat_submitted_at,
  last_message_at,
  last_message_from,
  last_customer_view_at,
  created_at,
  updated_at
`;

export type ProviderSupportTicketAccessResult<T> =
  | { ticket: T; response: null }
  | { ticket: null; response: ApiErrorResponse };

export async function requireProviderSupportTicketAccess<T extends { provider_id?: string | null; requester_type?: string | null }>(
  admin: AdminClient,
  userId: string,
  ticketId: string,
  select = PROVIDER_SUPPORT_TICKET_DETAIL_SELECT,
): Promise<ProviderSupportTicketAccessResult<T>> {
  const { data: ticket, error } = await admin
    .from("support_tickets")
    .select(select)
    .eq("id", ticketId)
    .maybeSingle();

  if (error) throw error;
  if (!ticket) {
    return { ticket: null, response: notFoundResponse("Ticket not found") };
  }

  const row = ticket as unknown as T;
  if (String(row.requester_type ?? "") !== "provider" || !row.provider_id) {
    return { ticket: null, response: notFoundResponse("Ticket not found") };
  }

  const hasAccess = await userHasProviderAccessAdmin(admin, userId, row.provider_id);
  if (!hasAccess) {
    return {
      ticket: null,
      response: errorResponse("You do not have access to this support ticket", "FORBIDDEN", 403),
    };
  }

  return { ticket: row, response: null };
}

export function withUnreadSupportFlag<T extends { last_message_at?: string | null; last_customer_view_at?: string | null; last_message_from?: string | null }>(
  ticket: T,
): T & { has_unread_staff_reply: boolean } {
  const lastMessageAt = ticket.last_message_at ? new Date(String(ticket.last_message_at)).getTime() : 0;
  const lastSeenAt = ticket.last_customer_view_at ? new Date(String(ticket.last_customer_view_at)).getTime() : 0;
  return {
    ...ticket,
    has_unread_staff_reply:
      ticket.last_message_from === "staff" && lastMessageAt > Math.max(0, lastSeenAt),
  };
}
