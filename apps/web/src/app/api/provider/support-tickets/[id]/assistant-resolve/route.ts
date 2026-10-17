import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { resolveSupportTicketViaAssistant } from "@/lib/support/support-assistant/resolve";
import { requireProviderSupportTicketAccess } from "@/lib/support/provider-support-ticket-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const access = await requireProviderSupportTicketAccess<{ id: string; user_id?: string | null }>(
      admin,
      user.id,
      id,
      "id, user_id",
    );
    if (access.response) return access.response;

    const ticketUserId = String(access.ticket.user_id ?? user.id);
    const result = await resolveSupportTicketViaAssistant({
      admin,
      ticketId: id,
      userId: ticketUserId,
    });

    if (result.ok === false) {
      return errorResponse(result.message, result.code, result.code === "NEEDS_HUMAN" ? 409 : 400);
    }

    return successResponse({ status: "resolved" });
  } catch (error) {
    return handleApiError(error, "Failed to resolve ticket");
  }
}
