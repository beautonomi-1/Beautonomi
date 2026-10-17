import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  errorResponse,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { resolveSupportTicketViaAssistant } from "@/lib/support/support-assistant/resolve";

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
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ticket) {
      return errorResponse("Ticket not found", "NOT_FOUND", 404);
    }

    const admin = getSupabaseAdmin();
    const result = await resolveSupportTicketViaAssistant({
      admin,
      ticketId: id,
      userId: user.id,
    });

    if (result.ok === false) {
      return errorResponse(result.message, result.code, result.code === "NEEDS_HUMAN" ? 409 : 400);
    }

    return successResponse({ status: "resolved" });
  } catch (error) {
    return handleApiError(error, "Failed to resolve ticket");
  }
}
