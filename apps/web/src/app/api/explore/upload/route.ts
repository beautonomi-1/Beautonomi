import { NextRequest } from "next/server";
import {
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { processExploreDisplayJpeg, generateVideoPlaceholderCard } from "@/lib/explore/brand-display-image";
import {
  getExploreVideoTranscodeCaps,
  getExploreImageUploadCaps,
  isExploreSoundCatalogEnabled,
  isExploreVideoUploadEnabled,
  isExploreVideoTranscodeEnabled,
  MAX_SOUND_BYTES,
} from "@/lib/explore/explore-feature-gates";
import {
  EXPLORE_MULTIPART_IMAGE_MAX_BYTES,
  exploreImageExtFromMime,
  isAllowedExploreImageMime,
} from "@/lib/explore/explore-upload-constants";
import { requireProviderExploreUploadAccess } from "@/lib/explore/explore-upload-access";
import { z } from "zod";

export const maxDuration = 60;

const signedUploadSchema = z.object({
  kind: z.enum(["video", "sound", "image"]),
  duration_ms: z.number().int().positive().optional(),
  size_bytes: z.number().int().positive().optional(),
  mime_type: z.string().optional(),
  include_placeholder_cover: z.boolean().optional(),
});

/**
 * GET /api/explore/upload — caps and feature gates for signed uploads (no secrets).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireProviderExploreUploadAccess(request);
    if ("error" in auth && auth.error) return auth.error;

    const caps = await getExploreVideoTranscodeCaps(null);
    const imageCaps = await getExploreImageUploadCaps(null);
    const videoUploadEnabled = await isExploreVideoUploadEnabled(null);
    const videoTranscodeEnabled = await isExploreVideoTranscodeEnabled(null);
    const soundCatalogEnabled = await isExploreSoundCatalogEnabled(null);

    return successResponse({
      max_video_bytes: caps.maxVideoBytes,
      max_duration_ms: caps.maxDurationMs,
      max_sound_bytes: MAX_SOUND_BYTES,
      max_image_bytes: imageCaps.maxImageBytes,
      max_multipart_image_bytes: EXPLORE_MULTIPART_IMAGE_MAX_BYTES,
      video_upload_enabled: videoUploadEnabled,
      video_transcode_enabled: videoTranscodeEnabled,
      sound_catalog_enabled: soundCatalogEnabled,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load upload config");
  }
}

/**
 * POST /api/explore/upload
 * - Multipart `file` for images (JPEG after client compress, sharp on server).
 * - JSON `{ kind: "video" | "sound" | "image", ... }` for signed Supabase upload (no bytes through Vercel).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireProviderExploreUploadAccess(request);
    if ("error" in auth && auth.error) return auth.error;
    const { providerId, supabaseAdmin } = auth;

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return handleSignedUploadJson(request, providerId, supabaseAdmin);
    }
    return handleMultipartImage(request, providerId, supabaseAdmin);
  } catch (error) {
    return handleApiError(error, "Failed to upload file");
  }
}

async function handleSignedUploadJson(
  request: NextRequest,
  providerId: string,
  supabaseAdmin: Awaited<ReturnType<typeof import("@/lib/supabase/admin").getSupabaseAdmin>>,
) {
  const parsed = signedUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid input", "VALIDATION_ERROR", 400);
  }
  const { kind, duration_ms, size_bytes, mime_type, include_placeholder_cover } = parsed.data;

  if (kind === "video") {
    if (!(await isExploreVideoUploadEnabled(null))) {
      return errorResponse("Video upload is disabled", "FORBIDDEN", 403);
    }
    const caps = await getExploreVideoTranscodeCaps(null);
    if (duration_ms == null || !Number.isFinite(duration_ms) || duration_ms <= 0) {
      return errorResponse("duration_ms is required for video upload", "VALIDATION_ERROR", 400);
    }
    if (size_bytes != null && size_bytes > caps.maxVideoBytes) {
      return errorResponse("Video file is too large", "VALIDATION_ERROR", 400);
    }
    /* Long clips are trimmed to max_duration_ms at Rendobar encode (WhatsApp-style), not rejected here. */
  } else if (kind === "image") {
    const imageCaps = await getExploreImageUploadCaps(null);
    if (size_bytes == null || size_bytes <= 0) {
      return errorResponse("size_bytes is required for image upload", "VALIDATION_ERROR", 400);
    }
    if (size_bytes > imageCaps.maxImageBytes) {
      return errorResponse("Image file is too large", "VALIDATION_ERROR", 400);
    }
    const mime = (mime_type ?? "").toLowerCase();
    if (!mime || !isAllowedExploreImageMime(mime)) {
      return errorResponse(
        "Unsupported file type. Use JPEG, PNG, WebP, or HEIC for photos.",
        "VALIDATION_ERROR",
        400,
      );
    }
  } else {
    if (!(await isExploreSoundCatalogEnabled(null))) {
      return errorResponse("Sound upload is disabled", "FORBIDDEN", 403);
    }
    if (size_bytes != null && size_bytes > MAX_SOUND_BYTES) {
      return errorResponse("Sound file is too large", "VALIDATION_ERROR", 400);
    }
    const allowed = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/m4a"];
    if (mime_type && !allowed.includes(mime_type.toLowerCase())) {
      return errorResponse("Sound must be MP3 or M4A", "VALIDATION_ERROR", 400);
    }
  }

  const ext =
    kind === "video" ? "mp4" : kind === "sound" ? "m4a" : exploreImageExtFromMime(mime_type ?? "image/jpeg");
  const safeName =
    kind === "image"
      ? `post-${Date.now()}.${ext}`
      : `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const path = `explore/${providerId}/${safeName}`;

  const { data, error } = await supabaseAdmin.storage.from("explore-posts").createSignedUploadUrl(path);
  if (error || !data) {
    return handleApiError(error ?? new Error("No signed URL"), "Failed to create upload URL");
  }

  let placeholder_cover_path: string | null = null;
  if (kind === "video" && include_placeholder_cover !== false) {
    const { data: prov } = await supabaseAdmin
      .from("providers")
      .select("business_name")
      .eq("id", providerId)
      .maybeSingle();
    const card = await generateVideoPlaceholderCard(prov?.business_name);
    const coverPath = `explore/${providerId}/cover-${Date.now()}.jpg`;
    await supabaseAdmin.storage.from("explore-posts").upload(coverPath, card.buffer, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
    placeholder_cover_path = coverPath;
  }

  return successResponse({
    path: data.path ?? path,
    signed_url: data.signedUrl,
    token: data.token,
    placeholder_cover_path,
  });
}

async function handleMultipartImage(
  request: NextRequest,
  providerId: string,
  supabaseAdmin: Awaited<ReturnType<typeof import("@/lib/supabase/admin").getSupabaseAdmin>>,
) {
  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) {
    return errorResponse("No file provided", "VALIDATION_ERROR", 400);
  }

  const declaredType = (file.type || "").toLowerCase();
  if (!isAllowedExploreImageMime(declaredType, file.name)) {
    return errorResponse(
      "Unsupported file type. Use JPEG, PNG, WebP, or HEIC for photos.",
      "VALIDATION_ERROR",
      400,
    );
  }

  if (file.size > EXPLORE_MULTIPART_IMAGE_MAX_BYTES) {
    return errorResponse(
      "File too large for direct upload. Use signed upload for larger photos.",
      "VALIDATION_ERROR",
      400,
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  const { data: prov } = await supabaseAdmin
    .from("providers")
    .select("business_name")
    .eq("id", providerId)
    .maybeSingle();

  const { buffer, width, height } = await processExploreDisplayJpeg(
    inputBuffer,
    prov?.business_name,
  );

  const displayPath = `explore/${providerId}/display-${Date.now()}.jpg`;
  const { data: uploadData, error } = await supabaseAdmin.storage
    .from("explore-posts")
    .upload(displayPath, buffer, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    return handleApiError(error, "Failed to upload display image");
  }

  const originalExt = file.name.split(".").pop() || "jpg";
  const originalPath = `explore/${providerId}/post-${Date.now()}.${originalExt}`;
  await supabaseAdmin.storage.from("explore-posts").upload(originalPath, inputBuffer, {
    contentType: declaredType || "image/jpeg",
    cacheControl: "3600",
    upsert: false,
  });

  return successResponse({
    path: originalPath,
    display_path: uploadData?.path ?? displayPath,
    width,
    height,
  });
}
