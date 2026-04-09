import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

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
      .select("id, ticket_number, subject, status, priority, category, created_at, updated_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (ticketError || !ticket) {
      return notFoundResponse("Ticket not found");
    }

    const { data: messages } = await supabase
      .from("support_ticket_messages")
      .select("id, message, is_internal, created_at, user_id, author:profiles(id, full_name, display_name)")
      .eq("ticket_id", id)
      .eq("is_internal", false)
      .order("created_at", { ascending: true });

    // Resolve author names: current user = "You", staff/admin = display name or "Support Team"
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
      ticket,
      messages: enrichedMessages,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch support ticket");
  }
}
