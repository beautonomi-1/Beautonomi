/**
 * Support ticket message files use the same Supabase Storage bucket as chat attachments
 * (`message-attachments`), with a dedicated path prefix so they stay separate from
 * conversation uploads: `support-tickets/{ticket_id}/{user_id}/...`
 *
 * @see MESSAGE_ATTACHMENTS_BUCKET in `@/lib/messaging/message-attachments`
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MESSAGE_ATTACHMENTS_BUCKET } from "@/lib/messaging/message-attachments";
import {
  getStorageServiceClientOrUser,
  hasSupabaseStorageServiceRole,
} from "@/lib/supabase/storage-service-client";

/** @deprecated Use MESSAGE_ATTACHMENTS_BUCKET — kept for any external imports */
export const SUPPORT_TICKET_ATTACHMENTS_BUCKET = MESSAGE_ATTACHMENTS_BUCKET;

export const SUPPORT_TICKET_ATTACHMENTS_PATH_PREFIX = "support-tickets";

export type SupportTicketAttachmentMeta = {
  url: string;
  type: string;
  name: string;
  size: number;
};

const allowedImageTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const allowedVideoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
const allowedDocTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes, ...allowedDocTypes];

const maxImageSize = 10 * 1024 * 1024;
const maxVideoSize = 50 * 1024 * 1024;
const maxDocSize = 10 * 1024 * 1024;

export function validateSupportTicketFiles(files: File[]): string | null {
  if (!files.length) return "No files provided";
  if (files.length > 10) return "Maximum 10 files per message";

  for (const file of files) {
    if (!allowedTypes.includes(file.type)) {
      return `Invalid file type: ${file.name}`;
    }
    let maxSize = maxDocSize;
    if (allowedImageTypes.includes(file.type)) maxSize = maxImageSize;
    else if (allowedVideoTypes.includes(file.type)) maxSize = maxVideoSize;
    if (file.size > maxSize) {
      return `File too large: ${file.name}`;
    }
  }
  return null;
}

/**
 * Upload files for a support ticket message; returns public URLs for JSON `attachments` column.
 */
export async function uploadSupportTicketFiles(
  supabase: SupabaseClient,
  files: File[],
  ticketId: string,
  userId: string
): Promise<SupportTicketAttachmentMeta[]> {
  const err = validateSupportTicketFiles(files);
  if (err) throw new Error(err);

  const client = getStorageServiceClientOrUser(supabase);

  if (hasSupabaseStorageServiceRole()) {
    const { data: buckets, error: listErr } = await client.storage.listBuckets();
    if (listErr) {
      console.warn("[support-ticket upload] listBuckets:", listErr.message);
    }
    const bucketExists = buckets?.some((b) => b.name === MESSAGE_ATTACHMENTS_BUCKET) ?? false;
    if (!bucketExists) {
      const { error: createError } = await client.storage.createBucket(MESSAGE_ATTACHMENTS_BUCKET, {
        public: true,
        fileSizeLimit: 52428800,
      });
      if (createError) {
        const msg = createError.message || "";
        if (!/already exists|duplicate/i.test(msg)) {
          throw new Error(
            `Storage bucket "${MESSAGE_ATTACHMENTS_BUCKET}" missing and could not be created. Create it in Supabase Dashboard > Storage, or set SUPABASE_SERVICE_ROLE_KEY.`
          );
        }
      }
    }
  }

  const uploaded: SupportTicketAttachmentMeta[] = [];
  const timestamp = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileExt = file.name.split(".").pop() || "bin";
    const fileName = `${SUPPORT_TICKET_ATTACHMENTS_PATH_PREFIX}/${ticketId}/${userId}/${timestamp}-${i}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await client.storage
      .from(MESSAGE_ATTACHMENTS_BUCKET)
      .upload(fileName, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error(`Support ticket upload failed for ${file.name}:`, uploadError);
      const msg = String((uploadError as { message?: string }).message ?? uploadError);
      if (/bucket|not found/i.test(msg)) {
        throw new Error(
          `Storage bucket "${MESSAGE_ATTACHMENTS_BUCKET}" is missing. Create it in Supabase Dashboard (same bucket as chat attachments).`
        );
      }
      continue;
    }

    const {
      data: { publicUrl },
    } = client.storage.from(MESSAGE_ATTACHMENTS_BUCKET).getPublicUrl(fileName);

    if (publicUrl) {
      uploaded.push({ url: publicUrl, type: file.type, name: file.name, size: file.size });
    }
  }

  if (uploaded.length === 0 && files.length > 0) {
    throw new Error("Failed to upload any files");
  }

  return uploaded;
}
