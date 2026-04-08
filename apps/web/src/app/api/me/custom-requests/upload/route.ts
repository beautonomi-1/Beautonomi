import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import {
  getStorageServiceClientOrUser,
  hasSupabaseStorageServiceRole,
} from "@/lib/supabase/storage-service-client";

/**
 * POST /api/me/custom-requests/upload
 *
 * Uploads inspiration photos for custom service requests to Supabase Storage.
 * Returns the public URLs that can be used in the custom request.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer(request);

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return errorResponse("No files provided", "VALIDATION_ERROR", 400);
    }

    if (files.length > 6) {
      return errorResponse("Maximum 6 files allowed", "VALIDATION_ERROR", 400);
    }

    // Validate file types and sizes
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    const maxSize = 5 * 1024 * 1024; // 5MB per file

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        return errorResponse(
          `Invalid file type: ${file.name}. Allowed types: JPEG, PNG, WebP, GIF`,
          "VALIDATION_ERROR",
          400
        );
      }
      if (file.size > maxSize) {
        return errorResponse(
          `File too large: ${file.name}. Maximum size is 5MB`,
          "VALIDATION_ERROR",
          400
        );
      }
    }

    const bucketName = "custom-request-attachments";
    const storageClient = getStorageServiceClientOrUser(supabase);

    if (hasSupabaseStorageServiceRole()) {
      const { data: buckets, error: listErr } = await storageClient.storage.listBuckets();
      if (listErr) {
        console.warn("[custom-requests/upload] listBuckets:", listErr.message);
      }
      const bucketExists = buckets?.some((b) => b.name === bucketName) ?? false;

      if (!bucketExists) {
        const { error: createError } = await storageClient.storage.createBucket(bucketName, {
          public: true,
          fileSizeLimit: 5242880, // 5MB
          allowedMimeTypes: allowedTypes,
        });

        if (createError) {
          const msg = createError.message || "";
          if (!/already exists|duplicate/i.test(msg)) {
            console.error("[custom-requests/upload] createBucket:", createError);
            throw new Error(
              `Storage bucket "${bucketName}" is missing and could not be created. Create it in Supabase Dashboard > Storage, or set SUPABASE_SERVICE_ROLE_KEY for server uploads.`
            );
          }
        }
      }
    }

    // Upload files to Supabase Storage
    // Storage path: custom-request-attachments/{user_id}/{timestamp}-{index}-{random}.{ext}
    const uploadedUrls: string[] = [];
    const timestamp = Date.now();
    const userId = user.id;
    let firstUploadError: string | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${userId}/${timestamp}-${i}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await storageClient.storage
        .from(bucketName)
        .upload(fileName, buffer, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error(`Failed to upload file ${file.name}:`, uploadError);
        if (!firstUploadError) {
          firstUploadError = (uploadError as { message?: string }).message || String(uploadError);
        }
        continue;
      }

      const {
        data: { publicUrl },
      } = storageClient.storage.from(bucketName).getPublicUrl(fileName);

      if (publicUrl) {
        uploadedUrls.push(publicUrl);
      }
    }

    if (uploadedUrls.length === 0) {
      const hint =
        firstUploadError && /bucket|not found/i.test(firstUploadError)
          ? ` (${firstUploadError}). Ensure bucket "${bucketName}" exists and SUPABASE_SERVICE_ROLE_KEY is set on the web app.`
          : firstUploadError
            ? ` (${firstUploadError})`
            : "";
      return errorResponse(`Failed to upload any files${hint}`, "UPLOAD_ERROR", 500);
    }

    return successResponse({
      urls: uploadedUrls,
      count: uploadedUrls.length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to upload files");
  }
}
