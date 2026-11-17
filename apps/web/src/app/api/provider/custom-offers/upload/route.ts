import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { uploadCustomRequestAttachments } from "@/lib/uploads/custom-request-attachments";

/**
 * POST /api/provider/custom-offers/upload
 *
 * Provider-role variant of custom request attachment upload.
 * Mirrors /api/me/custom-requests/upload for custom offer inspiration photos.
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("send_messages", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const formData = await request.formData();
    return uploadCustomRequestAttachments(user.id, supabase, formData);
  } catch (error) {
    return handleApiError(error, "Failed to upload files");
  }
}
