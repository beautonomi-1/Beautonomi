import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, requireRoleInApi, successResponse } from "@/lib/supabase/api-helpers";
import {
  PROVIDER_SUPPORT_TICKET_DETAIL_SELECT,
  requireProviderSupportTicketAccess,
} from "@/lib/support/provider-support-ticket-access";
import {
  enrichSupportTicketMessageForViewer,
  prependSupportTicketDescriptionIfNeeded,
} from "@/lib/support/support-ticket-thread";

type SupportMessageRow = {
  id: string;
  message: string;
  is_internal: boolean;
  created_at: string;
  user_id: string;
  attachments?: unknown;
  author?: { id?: string; full_name?: string | null; display_name?: string | null } | Array<{
    id?: string;
    full_name?: string | null;
    display_name?: string | null;
  }> | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const access = await requireProviderSupportTicketAccess(admin, user.id, id, PROVIDER_SUPPORT_TICKET_DETAIL_SELECT);
    if (access.response) return access.response;

    const { data: messages, error: messagesError } = await admin
      .from("support_ticket_messages")
      .select(
        "id, message, is_internal, created_at, user_id, attachments, author:users!support_ticket_messages_user_id_fkey(id, full_name, display_name)",
      )
      .eq("ticket_id", id)
      .eq("is_internal", false)
      .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;

    const enrichedMessages = (messages || []).map((m) =>
      enrichSupportTicketMessageForViewer(m as SupportMessageRow, user.id),
    );

    const ticket = access.ticket as {
      id: string;
      description?: string | null;
      created_at?: string | null;
      user_id?: string | null;
    };

    const { description: _description, user_id: _userId, ...ticketForClient } = ticket;

    return successResponse({
      ticket: ticketForClient,
      messages: prependSupportTicketDescriptionIfNeeded(ticket, enrichedMessages, user.id),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch provider support ticket");
  }
}
