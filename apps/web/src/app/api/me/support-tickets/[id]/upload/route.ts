import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse, notFoundResponse } from "@/lib/supabase/api-helpers";
import { uploadSupportTicketFiles } from "@/lib/support/support-ticket-attachment-upload";

/**
 * POST /api/me/support-tickets/[id]/upload
 * Ticket owner only. Multipart form: files[]
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const { id: ticketId } = await params;

    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .select("id, user_id")
      .eq("id", ticketId)
      .single();

    if (tErr || !ticket) return notFoundResponse("Ticket not found");
    if (ticket.user_id !== user.id) {
      return errorResponse("You can only attach files to your own tickets", "FORBIDDEN", 403);
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    if (!files?.length) {
      return errorResponse("No files provided", "VALIDATION_ERROR", 400);
    }

    const attachments = await uploadSupportTicketFiles(supabase, files, ticketId, user.id);
    return successResponse({ attachments, count: attachments.length });
  } catch (error: unknown) {
    return handleApiError(error, "Failed to upload attachments");
  }
}
