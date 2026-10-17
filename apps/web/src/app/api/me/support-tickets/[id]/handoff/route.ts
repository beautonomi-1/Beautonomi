import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  errorResponse,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { handoffSupportTicketToHuman } from "@/lib/support/support-assistant/handoff";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const { id } = await params;
    const supabase = await getSupabaseServer(request);
    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("id, user_id, handling_mode")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ticket) {
      return errorResponse("Ticket not found", "NOT_FOUND", 404);
    }

    const admin = getSupabaseAdmin();
    await handoffSupportTicketToHuman({
      admin,
      ticketId: id,
      request,
      reason: "User requested a person",
    });

    return successResponse({ handling_mode: "human" });
  } catch (error) {
    return handleApiError(error, "Failed to hand off ticket");
  }
}
