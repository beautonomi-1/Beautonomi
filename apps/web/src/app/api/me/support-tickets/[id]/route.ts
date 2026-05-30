import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import {
  enrichSupportTicketMessageForViewer,
  prependSupportTicketDescriptionIfNeeded,
} from "@/lib/support/support-ticket-thread";

/**
 * GET /api/me/support-tickets/[id]
 *
 * Get a single support ticket for the current user (owner only).
 * Returns ticket and non-internal messages only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, subject, description, user_id, status, priority, category, requester_type, support_context_type, support_context_id, support_context_label, csat_score, csat_comment, csat_submitted_at, last_message_at, last_message_from, last_customer_view_at, created_at, updated_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (ticketError || !ticket) {
      return notFoundResponse("Ticket not found");
    }

    const { data: messages, error: messagesError } = await supabase
      .from("support_ticket_messages")
      .select("id, message, is_internal, created_at, user_id, attachments, author:users!support_ticket_messages_user_id_fkey(id, full_name, display_name)")
      .eq("ticket_id", id)
      .eq("is_internal", false)
      .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;

    const enrichedMessages = (messages || []).map((m) =>
      enrichSupportTicketMessageForViewer(m as { user_id: string; author?: unknown; [key: string]: unknown }, user.id),
    );

    const { description: _description, user_id: _userId, ...ticketForClient } = ticket;

    return successResponse({
      ticket: ticketForClient,
      messages: prependSupportTicketDescriptionIfNeeded(ticket, enrichedMessages, user.id),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch support ticket");
  }
}
