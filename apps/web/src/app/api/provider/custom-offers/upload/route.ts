import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError } from "@/lib/supabase/api-helpers";
import { uploadCustomRequestAttachments } from "@/lib/uploads/custom-request-attachments";

/**
 * POST /api/provider/custom-offers/upload
 *
 * Provider-role variant of custom request attachment upload.
 * Mirrors /api/me/custom-requests/upload for custom offer inspiration photos.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const formData = await request.formData();
    return uploadCustomRequestAttachments(user.id, supabase, formData);
  } catch (error) {
    return handleApiError(error, "Failed to upload files");
  }
}
