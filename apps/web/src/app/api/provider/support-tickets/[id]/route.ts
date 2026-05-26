import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, requireRoleInApi, successResponse } from "@/lib/supabase/api-helpers";
import {
  PROVIDER_SUPPORT_TICKET_DETAIL_SELECT,
  requireProviderSupportTicketAccess,
} from "@/lib/support/provider-support-ticket-access";

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
      .select("id, message, is_internal, created_at, user_id, attachments, author:profiles(id, full_name, display_name)")
      .eq("ticket_id", id)
      .eq("is_internal", false)
      .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;

    const enrichedMessages = (messages || []).map((m: any) => {
      const authorProfile = Array.isArray(m.author) ? m.author[0] : m.author;
      const isCurrentUser = m.user_id === user.id;
      const authorName = isCurrentUser
        ? "You"
        : (authorProfile?.display_name || authorProfile?.full_name || "Support Team");
      const { author: _drop, ...rest } = m;
      return { ...rest, author_name: authorName, is_mine: isCurrentUser };
    });

    return successResponse({
      ticket: access.ticket,
      messages: enrichedMessages,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch provider support ticket");
  }
}
