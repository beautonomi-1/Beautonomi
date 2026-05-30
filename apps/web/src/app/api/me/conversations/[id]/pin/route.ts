import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";

/**
 * PATCH /api/me/conversations/[id]/pin
 * Body: { pinned: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const { id: conversationId } = await params;
    if (!conversationId) {
      return notFoundResponse("Conversation ID is required");
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.pinned !== "boolean") {
      return errorResponse("pinned (boolean) is required", "VALIDATION_ERROR", 400);
    }

    const supabase = await getSupabaseServer(request);
    const { data, error } = await supabase
      .from("conversations")
      .update({ is_starred_customer: body.pinned })
      .eq("id", conversationId)
      .eq("customer_id", user.id)
      .select("id, is_starred_customer")
      .single();

    if (error || !data) {
      return notFoundResponse("Conversation not found");
    }

    return successResponse({
      id: data.id,
      is_pinned: Boolean((data as { is_starred_customer?: boolean }).is_starred_customer),
    });
  } catch (error) {
    return handleApiError(error, "Failed to update pin");
  }
}
