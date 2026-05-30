import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getProviderIdForUser,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * PATCH /api/provider/conversations/[id]/pin
 * Body: { pinned: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const permissionCheck = await requirePermission("send_messages", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { id: conversationId } = await params;
    if (!conversationId) {
      return notFoundResponse("Conversation ID is required");
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.pinned !== "boolean") {
      return errorResponse("pinned (boolean) is required", "VALIDATION_ERROR", 400);
    }

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = getSupabaseAdmin();
    const providerId = await getProviderIdForUser(permissionCheck.user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data, error } = await supabaseAdmin
      .from("conversations")
      .update({ is_starred_provider: body.pinned })
      .eq("id", conversationId)
      .eq("provider_id", providerId)
      .select("id, is_starred_provider")
      .single();

    if (error || !data) {
      return notFoundResponse("Conversation not found");
    }

    return successResponse({
      id: data.id,
      is_pinned: Boolean((data as { is_starred_provider?: boolean }).is_starred_provider),
    });
  } catch (error) {
    return handleApiError(error, "Failed to update pin");
  }
}
