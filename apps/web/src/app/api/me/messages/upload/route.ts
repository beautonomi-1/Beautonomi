import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireSocialAccess } from "@/lib/safety/require-social-access";
import {
  assertNotBlocked,
  getConversationPeerUserId,
  UserBlockedError,
} from "@/lib/safety/user-blocks";
import {
  MESSAGE_ATTACHMENTS_BUCKET,
  messageAttachmentRetentionDays,
  createMessageAttachmentSignedUrl,
} from "@/lib/messaging/message-attachments";
import {
  getStorageServiceClientOrUser,
  hasSupabaseStorageServiceRole,
} from "@/lib/supabase/storage-service-client";

/**
 * POST /api/me/messages/upload
 * 
 * Uploads attachments (images, videos, documents) for messages to Supabase Storage.
 * Returns the public URLs that can be used in the message.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    await requireSocialAccess(user.id, "direct_message", request);
    const supabase = await getSupabaseServer(request);

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

    const supabaseAdmin = getSupabaseAdmin();
    const actorRole = isCustomer ? "customer" : "provider";
    const peerUserId = await getConversationPeerUserId(conv, user.id, actorRole, supabaseAdmin);
    if (peerUserId) {
      try {
        await assertNotBlocked(user.id, peerUserId, supabaseAdmin);
      } catch (e) {
        if (e instanceof UserBlockedError || (e as { code?: string }).code === "USER_BLOCKED") {
          return errorResponse("You cannot message this user", "USER_BLOCKED", 403);
        }
        throw e;
      }
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

    // Storage: listBuckets/createBucket must use the service role. The user-scoped client often
    // returns an empty bucket list (not an error), which falsely looked like a missing bucket.
    const storageClient = getStorageServiceClientOrUser(supabase);
    const bucketName = MESSAGE_ATTACHMENTS_BUCKET;

    if (hasSupabaseStorageServiceRole()) {
      const { data: buckets, error: listErr } = await storageClient.storage.listBuckets();
      if (listErr) {
        console.warn("[messages/upload] listBuckets:", listErr.message);
      }
      const bucketExists = buckets?.some((b) => b.name === bucketName) ?? false;

      if (!bucketExists) {
        // Omit allowedMimeTypes so the bucket accepts the same wide MIME set as a manually
        // created "Any" bucket; a restrictive list can cause create/upload mismatches.
        const { error: createError } = await storageClient.storage.createBucket(bucketName, {
          public: false,
          fileSizeLimit: 52428800, // 50MB
        });

        if (createError) {
          const msg = createError.message || "";
          if (!/already exists|duplicate/i.test(msg)) {
            console.error("[messages/upload] createBucket:", createError);
            throw new Error(
              `Storage bucket "${bucketName}" is missing and could not be created. Create it in Supabase Dashboard > Storage, or set SUPABASE_SERVICE_ROLE_KEY for server uploads.`
            );
          }
        }
      }
    }
    // Without service role: skip list/create (user JWT often cannot list buckets); upload may still work if Storage RLS allows.

    // Upload files to Supabase Storage
    // Storage path: message-attachments/{conversation_id}/{user_id}/{timestamp}-{index}-{random}.{ext}
    const uploadedAttachments: Array<{
      url: string;
      storage_path: string;
      type: string;
      name: string;
      size: number;
    }> = [];
    const timestamp = Date.now();
    const userId = user.id;

    let firstUploadError: string | null = null;

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
        if (!firstUploadError) {
          firstUploadError = (uploadError as { message?: string }).message || String(uploadError);
        }
        continue;
      }

      // Private bucket: persist storage_path; return short-lived signed URL for immediate preview.
      const signedUrl = await createMessageAttachmentSignedUrl(storageClient, fileName);
      uploadedAttachments.push({
        url: signedUrl ?? "",
        storage_path: fileName,
        type: file.type,
        name: file.name,
        size: file.size,
      });
    }

    if (uploadedAttachments.length === 0) {
      const hint =
        firstUploadError && /bucket|not found/i.test(firstUploadError)
          ? ` (${firstUploadError}). Ensure bucket "${bucketName}" exists and SUPABASE_SERVICE_ROLE_KEY is set on the web app.`
          : firstUploadError
            ? ` (${firstUploadError})`
            : "";
      return errorResponse(`Failed to upload any files${hint}`, "UPLOAD_ERROR", 500);
    }

    return successResponse({
      attachments: uploadedAttachments,
      count: uploadedAttachments.length,
      retentionDays: messageAttachmentRetentionDays(),
    });
  } catch (error) {
    return handleApiError(error, "Failed to upload files");
  }
}
