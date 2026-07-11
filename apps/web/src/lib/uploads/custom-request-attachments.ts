import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getStorageServiceClientOrUser,
  hasSupabaseStorageServiceRole,
} from "@/lib/supabase/storage-service-client";
import { errorResponse, successResponse } from "@/lib/supabase/api-helpers";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
const MAX_FILES = 6;
const MAX_BYTES_PER_FILE = 5 * 1024 * 1024;
const BUCKET_NAME = "custom-request-attachments";

function extensionFromMime(mime: string, fallback: string): string {
  switch (mime.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return fallback;
  }
}

function safeFilename(file: File): string {
  const raw = (file.name || "").trim();
  if (!raw) return "upload";
  return raw.replace(/[\\/]+/g, "_");
}

/**
 * Upload inspiration photos for custom service requests / offers.
 * Shared by customer and provider upload routes.
 */
export async function uploadCustomRequestAttachments(
  userId: string,
  supabase: SupabaseClient,
  formData: FormData,
) {
  const files = formData.getAll("files") as File[];

  if (!files || files.length === 0) {
    return errorResponse("No files provided", "VALIDATION_ERROR", 400);
  }

  if (files.length > MAX_FILES) {
    return errorResponse(`Maximum ${MAX_FILES} files allowed`, "VALIDATION_ERROR", 400);
  }

  for (const file of files) {
    const displayName = safeFilename(file);
    if (!file.size || file.size === 0) {
      return errorResponse(
        `File is empty: ${displayName}. Pick a valid image and try again.`,
        "VALIDATION_ERROR",
        400,
      );
    }
    const mime = (file.type || "").toLowerCase();
    if (!ALLOWED_TYPES.includes(mime as (typeof ALLOWED_TYPES)[number])) {
      return errorResponse(
        `Invalid file type: ${displayName}. Allowed types: JPEG, PNG, WebP, GIF`,
        "UNSUPPORTED_FILE_TYPE",
        400,
      );
    }
    if (file.size > MAX_BYTES_PER_FILE) {
      return errorResponse(
        `File too large: ${displayName}. Maximum size is 5MB.`,
        "FILE_TOO_LARGE",
        400,
      );
    }
  }

  const storageClient = getStorageServiceClientOrUser(supabase);

  if (hasSupabaseStorageServiceRole()) {
    const { data: buckets, error: listErr } = await storageClient.storage.listBuckets();
    if (listErr) {
      console.warn("[custom-request-attachments/upload] listBuckets:", listErr.message);
    }
    const bucketExists = buckets?.some((b) => b.name === BUCKET_NAME) ?? false;

    if (!bucketExists) {
      const { error: createError } = await storageClient.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_BYTES_PER_FILE,
        allowedMimeTypes: [...ALLOWED_TYPES],
      });

      if (createError) {
        const msg = createError.message || "";
        if (!/already exists|duplicate/i.test(msg)) {
          console.error("[custom-request-attachments/upload] createBucket:", createError);
          return errorResponse(
            `Photo storage isn't ready yet. Please try again later or contact support if this keeps happening.`,
            "STORAGE_UNAVAILABLE",
            503,
          );
        }
      }
    }
  }

  const uploadedUrls: string[] = [];
  const failedFiles: { name: string; reason: string }[] = [];
  const timestamp = Date.now();
  let firstUploadError: string | null = null;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const displayName = safeFilename(file);
    const fileExtFromName = displayName.includes(".")
      ? displayName.split(".").pop()?.toLowerCase()
      : undefined;
    const fileExt = extensionFromMime(file.type, fileExtFromName || "jpg");
    const fileName = `${userId}/${timestamp}-${i}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await storageClient.storage
      .from(BUCKET_NAME)
      .upload(fileName, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error(`Failed to upload file ${displayName}:`, uploadError);
      const msg = (uploadError as { message?: string }).message || String(uploadError);
      failedFiles.push({ name: displayName, reason: msg });
      if (!firstUploadError) firstUploadError = msg;
      continue;
    }

    const {
      data: { publicUrl },
    } = storageClient.storage.from(BUCKET_NAME).getPublicUrl(fileName);

    if (publicUrl) {
      uploadedUrls.push(publicUrl);
    } else {
      failedFiles.push({ name: displayName, reason: "Storage did not return a public URL" });
    }
  }

  if (uploadedUrls.length === 0) {
    const hint =
      firstUploadError && /bucket|not found/i.test(firstUploadError)
        ? ` (${firstUploadError}). Ensure bucket "${BUCKET_NAME}" exists and SUPABASE_SERVICE_ROLE_KEY is set on the web app.`
        : firstUploadError
          ? ` (${firstUploadError})`
          : "";
    return errorResponse(`Failed to upload any files${hint}`, "UPLOAD_ERROR", 500);
  }

  return successResponse({
    urls: uploadedUrls,
    count: uploadedUrls.length,
    requested: files.length,
    failed: failedFiles,
    partial: failedFiles.length > 0,
  });
}
