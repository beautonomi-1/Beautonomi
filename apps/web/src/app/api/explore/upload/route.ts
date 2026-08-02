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
import { requireSocialAccess } from "@/lib/safety/require-social-access";

/**
 * §Provider-audit 2026-05: previously only "image/jpeg|jpg|png|webp" was
 * allowed, which silently 400'd HEIC/HEIF photos shipped from iPhone
 * libraries (most providers' phones default to HEIC). The provider app
 * relays whatever ImagePicker gives us; rejecting HEIC made every iPhone
 * library upload appear "broken" with the generic "Invalid file type"
 * error. We now accept HEIC/HEIF + a few common gif/avif variants — the
 * Supabase storage bucket and downstream consumers handle them fine.
 */
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "image/gif",
  "image/avif",
];
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/m4v",
  "video/mpeg",
];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB (HEIC/large originals)
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
    await requireSocialAccess(user.id, "ugc_create", request);
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
        "create_explore_posts",
        undefined,
        request,
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

    // §Provider-audit 2026-05: be lenient when ImagePicker hands us
    // `application/octet-stream` (Android sometimes does), and fall back to
    // the file extension when present. Anything still unrecognised gets a
    // friendlier error message that names the formats we accept.
    const declaredType = (file.type || "").toLowerCase();
    const looksLikeImageByExt = /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i.test(file.name);
    const looksLikeVideoByExt = /\.(mp4|webm|mov|m4v|mpeg|mpg)$/i.test(file.name);
    const isAllowed =
      ALLOWED_TYPES.includes(declaredType) ||
      ((declaredType === "" || declaredType === "application/octet-stream") &&
        (looksLikeImageByExt || looksLikeVideoByExt));
    if (!isAllowed) {
      return errorResponse(
        "Unsupported file type. Use JPEG, PNG, WebP, HEIC, GIF, MP4, MOV, or WebM.",
        "VALIDATION_ERROR",
        400
      );
    }

    const isVideo =
      ALLOWED_VIDEO_TYPES.includes(declaredType) ||
      (looksLikeVideoByExt && !ALLOWED_IMAGE_TYPES.includes(declaredType));
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      return errorResponse(
        `File too large. Max ${isVideo ? "50MB" : "10MB"} for ${isVideo ? "videos" : "images"}.`,
        "VALIDATION_ERROR",
        400
      );
    }

    const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
    const safeName = `post-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    const path = `explore/${providerId}/${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Use the declared/derived content-type, falling back to a sane default
    // so the storage object always carries a Content-Type that the browser
    // (and the provider app's expo-image rendering) can understand.
    const storageContentType =
      declaredType && declaredType !== "application/octet-stream"
        ? file.type
        : isVideo
          ? "video/mp4"
          : "image/jpeg";

    const { data: uploadData, error } = await supabaseAdmin.storage
      .from("explore-posts")
      .upload(path, buffer, {
        contentType: storageContentType,
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
