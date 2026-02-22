import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";

/**
 * POST /api/upload
 * 
 * Upload a file to Supabase Storage
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(['provider_owner', 'provider_staff', 'customer', 'superadmin'], request);

    const supabase = await getSupabaseServer();
    const formData = await request.formData();
    
    const file = formData.get("file") as File;
    const folder = formData.get("folder") as string || "uploads";

    if (!file) {
      return errorResponse("No file provided", "VALIDATION_ERROR", 400);
    }

    // Validate file type (images only for now)
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return errorResponse("Invalid file type. Only images are allowed.", "VALIDATION_ERROR", 400);
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return errorResponse("File size exceeds 5MB limit", "VALIDATION_ERROR", 400);
    }

    // Generate unique filename
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data: _uploadData, error: uploadError } = await supabase.storage
      .from("public")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return errorResponse(
        `Failed to upload file: ${uploadError.message}`,
        "UPLOAD_ERROR",
        500,
        uploadError
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("public")
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    return successResponse({ url: publicUrl, path: filePath });
  } catch (error) {
    return handleApiError(error, "Failed to upload file");
  }
}
