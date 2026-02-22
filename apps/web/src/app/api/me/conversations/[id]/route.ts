import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

/**
 * DELETE /api/me/conversations/[id]
 * 
 * Delete a conversation (customer side - soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const conversationId = params.id;

    if (!conversationId) {
      return notFoundResponse("Conversation ID is required");
    }

    const supabase = await getSupabaseServer();

    // Verify the conversation belongs to this user (as customer)
    const { data: conversation, error: fetchError } = await supabase
      .from("conversations")
      .select("id, customer_id, provider_id")
      .eq("id", conversationId)
      .eq("customer_id", user.id)
      .single();

    if (fetchError || !conversation) {
      return notFoundResponse("Conversation not found or you don't have permission to delete it");
    }

    // Soft delete: Delete the conversation (hard delete for now, can be changed to soft delete later)
    // For soft delete, we could add a `customer_deleted_at` field and filter it out in queries
    const { error: deleteError } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (deleteError) {
      throw deleteError;
    }

    return successResponse({ deleted: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete conversation");
  }
}
