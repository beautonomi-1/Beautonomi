import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import type { UserRole } from "@/types/beautonomi";
import { SUPPORT_TICKET_STAFF_ROLES } from "@/lib/support/support-ticket-staff";
import { uploadSupportTicketFiles } from "@/lib/support/support-ticket-attachment-upload";

/**
 * POST /api/admin/support-tickets/[id]/upload
 * Multipart form: files[] — returns { attachments } for use in message POST.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi([...SUPPORT_TICKET_STAFF_ROLES] as UserRole[], request);
    const supabase = await getSupabaseServer(request);
    const { id: ticketId } = await params;

    const { data: ticket } = await supabase.from("support_tickets").select("id").eq("id", ticketId).maybeSingle();
    if (!ticket) {
      return errorResponse("Ticket not found", "NOT_FOUND", 404);
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
