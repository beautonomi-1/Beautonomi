import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/me/messages/upload
 * 
 * Uploads attachments (images, videos, documents) for messages to Supabase Storage.
 * Returns the public URLs that can be used in the message.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer();

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const conversationId = formData.get("conversation_id") as string;

    if (!files || files.length === 0) {
      return errorResponse("No files provided", "VALIDATION_ERROR", 400);
    }

    if (!conversationId) {
      return errorResponse("conversation_id is required", "VALIDATION_ERROR", 400);
    }

    // Verify access to conversation
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, customer_id, provider_id")
      .eq("id", conversationId)
      .single();
    
    if (!conv) {
      return errorResponse("Conversation not found", "NOT_FOUND", 404);
    }

    const isCustomer = conv.customer_id === user.id;
    let isProvider = false;
    if (!isCustomer) {
      const { data: providerRow } = await supabase.from("providers").select("id, user_id").eq("id", conv.provider_id).single();
      if (providerRow && (providerRow as any).user_id === user.id) isProvider = true;
      if (!isProvider) {
        const { data: staff } = await supabase
          .from("provider_staff")
          .select("id")
          .eq("provider_id", conv.provider_id)
          .eq("user_id", user.id)
          .maybeSingle();
        isProvider = Boolean(staff);
      }
    }

    if (!isCustomer && !isProvider) {
      return errorResponse("Not authorized to upload files to this conversation", "FORBIDDEN", 403);
    }

    if (files.length > 10) {
      return errorResponse("Maximum 10 files allowed per message", "VALIDATION_ERROR", 400);
    }

    // Validate file types and sizes
    const allowedImageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    const allowedVideoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
    const allowedDocTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes, ...allowedDocTypes];
    
    const maxImageSize = 10 * 1024 * 1024; // 10MB for images
    const maxVideoSize = 50 * 1024 * 1024; // 50MB for videos
    const maxDocSize = 10 * 1024 * 1024; // 10MB for documents

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        return errorResponse(
          `Invalid file type: ${file.name}. Allowed types: Images (JPEG, PNG, WebP, GIF), Videos (MP4, WebM, MOV, AVI), Documents (PDF, DOC, DOCX)`,
          "VALIDATION_ERROR",
          400
        );
      }
      
      let maxSize = maxDocSize;
      if (allowedImageTypes.includes(file.type)) {
        maxSize = maxImageSize;
      } else if (allowedVideoTypes.includes(file.type)) {
        maxSize = maxVideoSize;
      }
      
      if (file.size > maxSize) {
        const sizeMB = Math.round(maxSize / (1024 * 1024));
        return errorResponse(
          `File too large: ${file.name}. Maximum size is ${sizeMB}MB`,
          "VALIDATION_ERROR",
          400
        );
      }
    }

    // Check if storage bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketName = "message-attachments";
    const bucketExists = buckets?.some((b) => b.name === bucketName);

    if (!bucketExists) {
      // Try to create the bucket (requires admin privileges)
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: allowedTypes,
      });

      if (createError) {
        console.error("Failed to create bucket:", createError);
        throw new Error(
          'Storage bucket "message-attachments" not found. Please create it in Supabase Dashboard > Storage.'
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
    // Storage path: message-attachments/{conversation_id}/{user_id}/{timestamp}-{index}-{random}.{ext}
    const uploadedAttachments: Array<{ url: string; type: string; name: string; size: number }> = [];
    const timestamp = Date.now();
    const userId = user.id;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${conversationId}/${userId}/${timestamp}-${i}-${Math.random().toString(36).substring(7)}.${fileExt}`;

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
        continue;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = storageClient.storage.from(bucketName).getPublicUrl(fileName);

      if (publicUrl) {
        uploadedAttachments.push({
          url: publicUrl,
          type: file.type,
          name: file.name,
          size: file.size,
        });
      }
    }

    if (uploadedAttachments.length === 0) {
      return errorResponse("Failed to upload any files", "UPLOAD_ERROR", 500);
    }

    return successResponse({
      attachments: uploadedAttachments,
      count: uploadedAttachments.length,
    });
  } catch (error) {
    return handleApiError(error, "Failed to upload files");
  }
}
