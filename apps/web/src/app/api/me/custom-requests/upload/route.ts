import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, handleApiError } from "@/lib/supabase/api-helpers";
import { uploadCustomRequestAttachments } from "@/lib/uploads/custom-request-attachments";

/**
 * POST /api/me/custom-requests/upload
 *
 * Uploads inspiration photos for custom service requests to Supabase Storage.
 * Returns the public URLs that can be used in the custom request.
 *
 * §custom-request-upload-hardening 2026-05: the mobile picker often supplies
 * filenames without extensions (e.g. iOS sometimes returns "image.jpg" but
 * also bare "image" depending on asset type). Derive the file extension from
 * the validated MIME type so storage objects always have a sensible suffix
 * and the public URL is browser-renderable.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const formData = await request.formData();
    return uploadCustomRequestAttachments(user.id, supabase, formData);
  } catch (error) {
    return handleApiError(error, "Failed to upload files");
  }
}
