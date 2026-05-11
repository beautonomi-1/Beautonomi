import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { errorResponse, handleApiError, requireRoleInApi, successResponse } from "@/lib/supabase/api-helpers";

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
    const supabase = await getSupabaseServer(request);

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (ticketError || !ticket) {
      return errorResponse("Ticket not found", "NOT_FOUND", 404);
    }

    if (ticket.user_id !== user.id) {
      return errorResponse("You can only mark your own tickets as seen", "FORBIDDEN", 403);
    }

    const seenAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("support_tickets")
      .update({ last_customer_view_at: seenAt })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) throw updateError;

    return successResponse({ seen_at: seenAt });
  } catch (error) {
    return handleApiError(error, "Failed to mark support ticket as seen");
  }
}
