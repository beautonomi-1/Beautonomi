import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, requireRoleInApi, successResponse } from "@/lib/supabase/api-helpers";
import { requireProviderSupportTicketAccess } from "@/lib/support/provider-support-ticket-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const access = await requireProviderSupportTicketAccess(admin, user.id, id, "id, provider_id, requester_type");
    if (access.response) return access.response;

    const seenAt = new Date().toISOString();
    const { error } = await admin
      .from("support_tickets")
      .update({ last_customer_view_at: seenAt })
      .eq("id", id)
      .eq("provider_id", access.ticket.provider_id);

    if (error) throw error;

    return successResponse({ seen_at: seenAt });
  } catch (error) {
    return handleApiError(error, "Failed to mark provider support ticket as seen");
  }
}
