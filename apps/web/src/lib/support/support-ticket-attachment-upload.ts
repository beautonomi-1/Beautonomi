/**
 * Support ticket message files use the same Supabase Storage bucket as chat attachments
 * (`message-attachments`), with a dedicated path prefix so they stay separate from
 * conversation uploads: `support-tickets/{ticket_id}/{user_id}/...`
 *
 * @see MESSAGE_ATTACHMENTS_BUCKET in `@/lib/messaging/message-attachments`
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MESSAGE_ATTACHMENTS_BUCKET, createMessageAttachmentSignedUrl } from "@/lib/messaging/message-attachments";
import {
  getStorageServiceClientOrUser,
  hasSupabaseStorageServiceRole,
} from "@/lib/supabase/storage-service-client";

/** @deprecated Use MESSAGE_ATTACHMENTS_BUCKET — kept for any external imports */
export const SUPPORT_TICKET_ATTACHMENTS_BUCKET = MESSAGE_ATTACHMENTS_BUCKET;

export const SUPPORT_TICKET_ATTACHMENTS_PATH_PREFIX = "support-tickets";

export type SupportTicketAttachmentMeta = {
  url: string;
  storage_path: string;
  type: string;
  name: string;
  size: number;
};

export const SUPPORT_TICKET_ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const SUPPORT_TICKET_ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
] as const;
export const SUPPORT_TICKET_ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const SUPPORT_TICKET_ALLOWED_MIME_TYPES = [
  ...SUPPORT_TICKET_ALLOWED_IMAGE_TYPES,
  ...SUPPORT_TICKET_ALLOWED_VIDEO_TYPES,
  ...SUPPORT_TICKET_ALLOWED_DOC_TYPES,
] as const;

export const SUPPORT_TICKET_MAX_ATTACHMENTS_PER_MESSAGE = 10;
const maxImageSize = 10 * 1024 * 1024;
const maxVideoSize = 50 * 1024 * 1024;
const maxDocSize = 10 * 1024 * 1024;

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function guessMimeTypeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

export function validateSupportTicketAttachmentCandidate(params: {
  name: string;
  type: string;
  size: number;
}): string | null {
  const mime = params.type || guessMimeTypeFromFileName(params.name);
  if (!SUPPORT_TICKET_ALLOWED_MIME_TYPES.includes(mime as (typeof SUPPORT_TICKET_ALLOWED_MIME_TYPES)[number])) {
    return `Invalid file type: ${params.name}`;
  }
  let maxSize = maxDocSize;
  if ((SUPPORT_TICKET_ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime)) maxSize = maxImageSize;
  else if ((SUPPORT_TICKET_ALLOWED_VIDEO_TYPES as readonly string[]).includes(mime)) maxSize = maxVideoSize;
  if (params.size > maxSize) {
    return `File too large: ${params.name}`;
  }
  return null;
}

export function validateSupportTicketFiles(files: File[]): string | null {
  if (!files.length) return "No files provided";
  if (files.length > SUPPORT_TICKET_MAX_ATTACHMENTS_PER_MESSAGE) {
    return "Maximum 10 files per message";
  }

  for (const file of files) {
    const err = validateSupportTicketAttachmentCandidate({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (err) return err;
  }
  return null;
}

async function ensureMessageAttachmentsBucket(client: ReturnType<typeof getStorageServiceClientOrUser>): Promise<void> {
  if (!hasSupabaseStorageServiceRole()) return;
  const { data: buckets, error: listErr } = await client.storage.listBuckets();
  if (listErr) {
    console.warn("[support-ticket upload] listBuckets:", listErr.message);
  }
  const bucketExists = buckets?.some((b) => b.name === MESSAGE_ATTACHMENTS_BUCKET) ?? false;
  if (!bucketExists) {
    const { error: createError } = await client.storage.createBucket(MESSAGE_ATTACHMENTS_BUCKET, {
      public: false,
      fileSizeLimit: 52428800,
    });
    if (createError) {
      const msg = createError.message || "";
      if (!/already exists|duplicate/i.test(msg)) {
        throw new Error(
          `Storage bucket "${MESSAGE_ATTACHMENTS_BUCKET}" missing and could not be created. Create it in Supabase Dashboard > Storage, or set SUPABASE_SERVICE_ROLE_KEY.`,
        );
      }
    }
  }
}

function storagePathForSupportTicketFile(
  ticketId: string,
  ownerSegment: string,
  index: number,
  fileName: string,
): string {
  const fileExt = fileName.split(".").pop() || "bin";
  const timestamp = Date.now();
  return `${SUPPORT_TICKET_ATTACHMENTS_PATH_PREFIX}/${ticketId}/${ownerSegment}/${timestamp}-${index}-${Math.random().toString(36).substring(7)}.${fileExt}`;
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
  await ensureMessageAttachmentsBucket(client);

  const uploaded: SupportTicketAttachmentMeta[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const storagePath = storagePathForSupportTicketFile(ticketId, userId, i, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());

    const meta = await uploadSupportTicketBufferToStorage(client, {
      buffer,
      storagePath,
      contentType: file.type,
      name: file.name,
      size: file.size,
    });
    if (meta) uploaded.push(meta);
  }

  if (uploaded.length === 0 && files.length > 0) {
    throw new Error("Failed to upload any files");
  }

  return uploaded;
}

async function uploadSupportTicketBufferToStorage(
  client: ReturnType<typeof getStorageServiceClientOrUser>,
  params: {
    buffer: Buffer;
    storagePath: string;
    contentType: string;
    name: string;
    size: number;
  },
): Promise<SupportTicketAttachmentMeta | null> {
  const { error: uploadError } = await client.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .upload(params.storagePath, params.buffer, {
      contentType: params.contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error(`Support ticket upload failed for ${params.name}:`, uploadError);
    const msg = String((uploadError as { message?: string }).message ?? uploadError);
    if (/bucket|not found/i.test(msg)) {
      throw new Error(
        `Storage bucket "${MESSAGE_ATTACHMENTS_BUCKET}" is missing. Create it in Supabase Dashboard (same bucket as chat attachments).`,
      );
    }
    return null;
  }

  const signedUrl = await createMessageAttachmentSignedUrl(client, params.storagePath);
  return {
    url: signedUrl ?? "",
    storage_path: params.storagePath,
    type: params.contentType,
    name: params.name,
    size: params.size,
  };
}

export type SupportTicketBufferUpload = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

/**
 * Upload inbound buffers (e.g. Zoho Mail) using the same rules as desk uploads.
 * `ownerSegment` is usually requester user id or `email-ingest`.
 */
export async function uploadSupportTicketBuffers(
  supabase: SupabaseClient,
  params: {
    ticketId: string;
    ownerSegment: string;
    files: SupportTicketBufferUpload[];
  },
): Promise<SupportTicketAttachmentMeta[]> {
  if (params.files.length === 0) return [];
  if (params.files.length > SUPPORT_TICKET_MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new Error("Maximum 10 files per message");
  }

  for (const file of params.files) {
    const err = validateSupportTicketAttachmentCandidate({
      name: file.name,
      type: file.mimeType,
      size: file.buffer.byteLength,
    });
    if (err) throw new Error(err);
  }

  const client = getStorageServiceClientOrUser(supabase);
  await ensureMessageAttachmentsBucket(client);

  const uploaded: SupportTicketAttachmentMeta[] = [];
  for (let i = 0; i < params.files.length; i++) {
    const file = params.files[i]!;
    const mime = file.mimeType || guessMimeTypeFromFileName(file.name);
    const storagePath = storagePathForSupportTicketFile(params.ticketId, params.ownerSegment, i, file.name);
    const meta = await uploadSupportTicketBufferToStorage(client, {
      buffer: file.buffer,
      storagePath,
      contentType: mime,
      name: file.name,
      size: file.buffer.byteLength,
    });
    if (meta) uploaded.push(meta);
  }
  return uploaded;
}
