import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { uploadSupportTicketFiles } from "@/lib/support/support-ticket-attachment-upload";
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

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    if (!files?.length) {
      return errorResponse("No files provided", "VALIDATION_ERROR", 400);
    }

    const attachments = await uploadSupportTicketFiles(admin, files, id, user.id);
    return successResponse({ attachments, count: attachments.length });
  } catch (error) {
    return handleApiError(error, "Failed to upload provider support attachments");
  }
}
