import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/me/custom-requests/upload
 * 
 * Uploads inspiration photos for custom service requests to Supabase Storage.
 * Returns the public URLs that can be used in the custom request.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const supabase = await getSupabaseServer();

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

    // Check if storage bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketName = "custom-request-attachments";
    const bucketExists = buckets?.some((b) => b.name === bucketName);

    if (!bucketExists) {
      // Try to create the bucket (requires admin privileges)
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: allowedTypes,
      });

      if (createError) {
        console.error("Failed to create bucket:", createError);
        throw new Error(
          'Storage bucket "custom-request-attachments" not found. Please create it in Supabase Dashboard > Storage.'
        );
      }
    }

    // Use service role client for storage operations (bypasses RLS)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    let storageClient = supabase;
    if (serviceRoleKey && supabaseUrl) {
      storageClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }

    // Upload files to Supabase Storage
    // Storage path: custom-request-attachments/{user_id}/{timestamp}-{index}-{random}.{ext}
    const uploadedUrls: string[] = [];
    const timestamp = Date.now();
    const userId = user.id;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = file.name.split(".").pop() || "jpg";
      // Organize by user ID and timestamp for easy management
      const fileName = `${userId}/${timestamp}-${i}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Convert File to ArrayBuffer then Buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to Supabase Storage
      const { data: _uploadData, error: uploadError } = await storageClient.storage
        .from(bucketName)
        .upload(fileName, buffer, {
          contentType: file.type,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error(`Failed to upload file ${file.name}:`, uploadError);
        // Continue with other files, but log the error
        continue;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = storageClient.storage.from(bucketName).getPublicUrl(fileName);

      if (publicUrl) {
        uploadedUrls.push(publicUrl);
      }
    }

    if (uploadedUrls.length === 0) {
      return errorResponse("Failed to upload any files", "UPLOAD_ERROR", 500);
    }

    return successResponse({
      urls: uploadedUrls,
      count: uploadedUrls.length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to upload files");
  }
}
