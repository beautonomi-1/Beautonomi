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
    const supabase = await getSupabaseServer();

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
      .select("id, message, is_internal, created_at, user_id")
      .eq("ticket_id", id)
      .eq("is_internal", false)
      .order("created_at", { ascending: true });

    return successResponse({
      ticket,
      messages: messages || [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch support ticket");
  }
}
