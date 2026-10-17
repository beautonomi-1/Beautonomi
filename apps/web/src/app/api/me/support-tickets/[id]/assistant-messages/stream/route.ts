import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, requireRoleInApi } from "@/lib/supabase/api-helpers";
import { postSupportAssistantMessageStream } from "@/lib/support/support-assistant/post-assistant-stream";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let user: { id: string };
  try {
    ({ user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    ));
  } catch (error) {
    return handleApiError(error, "Failed to stream assistant reply");
  }
  const { id } = await params;
  const supabase = await getSupabaseServer(request);
  const admin = getSupabaseAdmin();

  return postSupportAssistantMessageStream({
    request,
    ticketId: id,
    userId: user.id,
    admin,
    loadTicket: async () => {
      const { data: ticket } = await supabase
        .from("support_tickets")
        .select("id, handling_mode")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      return ticket;
    },
  });
}
