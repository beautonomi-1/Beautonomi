import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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

    // Note: do NOT embed `author:users(...)` here. This handler runs on the
    // ticket owner's RLS-scoped session, which cannot read other users' rows
    // (e.g. support agents), so the embed always resolves to null for staff and
    // a stale PostgREST relationship cache can make the whole query 500. We
    // resolve author display names separately with the service-role client.
    const { data: messages, error: messagesError } = await supabase
      .from("support_ticket_messages")
      .select("id, message, is_internal, created_at, user_id, attachments")
      .eq("ticket_id", id)
      .eq("is_internal", false)
      .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;

    const authorIds = Array.from(
      new Set(
        (messages || [])
          .map((m) => (m as { user_id?: string | null }).user_id)
          .filter((uid): uid is string => Boolean(uid) && uid !== user.id),
      ),
    );

    const authorNameById = new Map<string, string | null>();
    if (authorIds.length > 0) {
      const admin = getSupabaseAdmin();
      const { data: authorRows } = await admin
        .from("users")
        .select("id, full_name")
        .in("id", authorIds);
      for (const row of authorRows || []) {
        authorNameById.set(
          (row as { id: string }).id,
          (row as { full_name?: string | null }).full_name ?? null,
        );
      }
    }

    const enrichedMessages = (messages || []).map((m) => {
      const userId = (m as { user_id?: string | null }).user_id ?? "";
      return enrichSupportTicketMessageForViewer(
        { ...(m as Record<string, unknown>), user_id: userId, author: { full_name: authorNameById.get(userId) ?? null } },
        user.id,
      );
    });

    const { description: _description, user_id: _userId, ...ticketForClient } = ticket;

    return successResponse({
      ticket: ticketForClient,
      messages: prependSupportTicketDescriptionIfNeeded(ticket, enrichedMessages, user.id),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch support ticket");
  }
}
