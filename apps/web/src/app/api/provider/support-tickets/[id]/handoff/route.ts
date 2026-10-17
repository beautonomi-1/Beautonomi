import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { handoffSupportTicketToHuman } from "@/lib/support/support-assistant/handoff";
import { requireProviderSupportTicketAccess } from "@/lib/support/provider-support-ticket-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const access = await requireProviderSupportTicketAccess(admin, user.id, id, "id");
    if (access.response) return access.response;

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
