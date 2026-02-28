import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireRoleInApi } from "@/lib/supabase/api-helpers";
import { hasPermission } from "@/lib/auth/permissions";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * POST /api/explore/upload
 * Upload media for explore post. Multipart form with "file". Returns path for use in POST /api/explore/posts.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const supabaseAdmin = await getSupabaseAdmin();
    const isOwner =
      (await supabaseAdmin
        .from("providers")
        .select("id")
        .eq("user_id", user.id)
        .single()).data != null;

    if (!isOwner) {
      const hasCreatePermission = await hasPermission(
        user.id,
        "create_explore_posts"
      );
      if (!hasCreatePermission) {
        return errorResponse(
          "Permission denied: create_explore_posts required",
          "FORBIDDEN",
          403
        );
      }
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return errorResponse("No file provided", "VALIDATION_ERROR", 400);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return errorResponse(
        "Invalid file type. Use JPEG, PNG, WebP, MP4, or WebM.",
        "VALIDATION_ERROR",
        400
      );
    }

    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      return errorResponse(
        `File too large. Max ${isVideo ? "50MB" : "5MB"} for ${isVideo ? "videos" : "images"}.`,
        "VALIDATION_ERROR",
        400
      );
    }

    const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
    const safeName = `post-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const path = `explore/${providerId}/${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data: uploadData, error } = await supabaseAdmin.storage
      .from("explore-posts")
      .upload(path, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      if (
        error.message.includes("Bucket not found") ||
        error.message.includes("does not exist")
      ) {
        return errorResponse(
          "Storage bucket explore-posts not found. Create it in Supabase Dashboard.",
          "STORAGE_ERROR",
          500
        );
      }
      return handleApiError(error, "Failed to upload file");
    }

    return successResponse({ path: uploadData.path });
  } catch (error) {
    return handleApiError(error, "Failed to upload file");
  }
}
