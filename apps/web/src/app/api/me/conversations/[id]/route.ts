import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";

/**
 * DELETE /api/me/conversations/[id]
 *
 * Delete a conversation from the customer's view.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const { id: conversationId } = await params;

    if (!conversationId) {
      return notFoundResponse("Conversation ID is required");
    }

    // Use admin client so RLS doesn't block the lookup even if user auth state differs
    const supabase = getSupabaseAdmin();

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
