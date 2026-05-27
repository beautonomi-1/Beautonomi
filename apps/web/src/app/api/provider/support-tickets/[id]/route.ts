import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, requireRoleInApi, successResponse } from "@/lib/supabase/api-helpers";
import {
  PROVIDER_SUPPORT_TICKET_DETAIL_SELECT,
  requireProviderSupportTicketAccess,
} from "@/lib/support/provider-support-ticket-access";

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

function enrichProviderSupportMessage(
  m: SupportMessageRow,
  currentUserId: string,
): Record<string, unknown> {
  const authorProfile = Array.isArray(m.author) ? m.author[0] : m.author;
  const isCurrentUser = m.user_id === currentUserId;
  const authorName = isCurrentUser
    ? "You"
    : (authorProfile?.display_name || authorProfile?.full_name || "Support Team");
  const { author: _drop, ...rest } = m;
  return { ...rest, author_name: authorName, is_mine: isCurrentUser };
}

function prependDescriptionIfNeeded(
  ticket: { id: string; description?: string | null; created_at?: string | null; user_id?: string | null },
  messages: Record<string, unknown>[],
): Record<string, unknown>[] {
  const description = typeof ticket.description === "string" ? ticket.description.trim() : "";
  if (!description) return messages;

  const firstMessageText =
    messages.length > 0 && typeof messages[0]?.message === "string"
      ? String(messages[0].message).trim()
      : "";

  if (firstMessageText === description) return messages;

  const synthetic: Record<string, unknown> = {
    id: `ticket-description-${ticket.id}`,
    message: description,
    is_internal: false,
    created_at: ticket.created_at ?? new Date().toISOString(),
    user_id: ticket.user_id ?? "",
    author_name: "You",
    is_mine: true,
    attachments: [],
    is_ticket_description: true,
  };

  return [synthetic, ...messages];
}

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
      enrichProviderSupportMessage(m as SupportMessageRow, user.id),
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
      messages: prependDescriptionIfNeeded(ticket, enrichedMessages),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch provider support ticket");
  }
}
