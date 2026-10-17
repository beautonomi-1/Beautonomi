import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { postSupportAssistantMessageStream } from "@/lib/support/support-assistant/post-assistant-stream";
import { requireProviderSupportTicketAccess } from "@/lib/support/provider-support-ticket-access";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = getSupabaseAdmin();
  const { id } = await params;
  let user: { id: string };
  let ticket: { id: string; handling_mode?: string | null };
  try {
    ({ user } = await requireRoleInApi(["provider_owner", "provider_staff"], request));
    const access = await requireProviderSupportTicketAccess<{ id: string; handling_mode?: string | null }>(
      admin,
      user.id,
      id,
      "id, handling_mode",
    );
    if (access.response) return access.response;
    ticket = access.ticket;
  } catch (error) {
    return handleApiError(error, "Failed to stream assistant reply");
  }

  return postSupportAssistantMessageStream({
    request,
    ticketId: id,
    userId: user.id,
    admin,
    loadTicket: async () => ticket,
  });
}
