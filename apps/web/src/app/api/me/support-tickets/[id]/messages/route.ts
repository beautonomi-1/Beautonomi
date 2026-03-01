import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";

/**
 * POST /api/me/support-tickets/[id]/messages
 *
 * Add a reply to the current user's support ticket (owner only).
 * Messages are always non-internal (visible to user).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id } = await params;
    const supabase = await getSupabaseServer();
    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!message) {
      return errorResponse("Message is required", "VALIDATION_ERROR", 400);
    }

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (ticketError || !ticket) {
      return notFoundResponse("Ticket not found");
    }

    if (ticket.user_id !== user.id) {
      return errorResponse("You can only reply to your own tickets", "FORBIDDEN", 403);
    }

    const { data: newMessage, error: insertError } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: id,
        user_id: user.id,
        message: message.slice(0, 10000),
        is_internal: false,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    await supabase
      .from("support_tickets")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);

    return successResponse({ message: newMessage });
  } catch (error) {
    return handleApiError(error, "Failed to add message");
  }
}
