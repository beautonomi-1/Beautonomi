/**
 * Chat file attachments live in Supabase Storage bucket `message-attachments`
 * (see /api/me/messages/upload). This module defines retention and URL helpers.
 *
 * Override with `MESSAGE_ATTACHMENTS_BUCKET` (server) or `NEXT_PUBLIC_MESSAGE_ATTACHMENTS_BUCKET`
 * if your project uses a different bucket id (must match Supabase Dashboard).
 */

export const MESSAGE_ATTACHMENTS_BUCKET =
  (typeof process !== "undefined" &&
    (process.env.MESSAGE_ATTACHMENTS_BUCKET?.trim() ||
      process.env.NEXT_PUBLIC_MESSAGE_ATTACHMENTS_BUCKET?.trim())) ||
  "message-attachments";

export function messageAttachmentRetentionDays(): number {
  const n = parseInt(process.env.MESSAGE_ATTACHMENT_RETENTION_DAYS || "90", 10);
  return Number.isFinite(n) && n > 0 ? n : 90;
}

/** ISO timestamp: messages created before this are treated as past file retention. */
export function messageAttachmentRetentionCutoffIso(nowMs = Date.now()): string {
  const d = new Date(nowMs - messageAttachmentRetentionDays() * 86_400_000);
  return d.toISOString();
}

/**
 * Extract storage object path from a public object URL for this project.
 */
export function extractMessageAttachmentStoragePath(
  publicUrl: string,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
): string | null {
  if (!publicUrl || !supabaseUrl) return null;
  const normalizedBase = supabaseUrl.replace(/\/$/, "");
  const marker = `/storage/v1/object/public/${MESSAGE_ATTACHMENTS_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  let path = publicUrl.slice(idx + marker.length);
  const q = path.indexOf("?");
  if (q !== -1) path = path.slice(0, q);
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function isStorageBackedChatAttachment(att: Record<string, unknown>): boolean {
  if (att.offer_id != null || att.type === "custom_offer" || att.type === "custom_request") {
    return false;
  }
  const url = String(att.url || "");
  if (!url) return false;
  // Support ticket files live in the same bucket under `support-tickets/...` — not chat retention scope
  if (url.includes(`/${MESSAGE_ATTACHMENTS_BUCKET}/support-tickets/`) || url.includes("/message-attachments/support-tickets/")) {
    return false;
  }
  return url.includes(`/${MESSAGE_ATTACHMENTS_BUCKET}/`) || url.includes("/message-attachments/");
}

/**
 * For API responses: hide direct file URLs after retention; keep structural metadata for UI.
 */
export function sanitizeMessageAttachmentsForResponse(
  attachments: unknown,
  messageCreatedAt: string,
  nowMs = Date.now()
): unknown[] {
  const arr = Array.isArray(attachments) ? attachments : [];
  if (arr.length === 0) return arr;
  const cutoffMs = new Date(messageAttachmentRetentionCutoffIso(nowMs)).getTime();
  const msgMs = new Date(messageCreatedAt).getTime();
  if (!Number.isFinite(msgMs) || msgMs >= cutoffMs) return arr;

  return arr.map((item) => {
    if (!item || typeof item !== "object") return item;
    const o = item as Record<string, unknown>;
    if (!isStorageBackedChatAttachment(o)) return item;
    return {
      ...o,
      url: "",
      expired: true,
      name: (o.name as string) || "Attachment",
    };
  });
}

export function collectStoragePathsFromAttachmentsJson(attachments: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(attachments)) return out;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  for (const item of attachments) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (!isStorageBackedChatAttachment(o)) continue;
    const path = extractMessageAttachmentStoragePath(String(o.url || ""), base);
    if (path) out.push(path);
  }
  return out;
}

/**
 * Remove storage-backed file entries after expiry job; keep offers and other structured payloads.
 */
export function stripStorageBackedAttachmentsForPersistence(attachments: unknown): unknown[] {
  const arr = Array.isArray(attachments) ? attachments : [];
  return arr.map((item) => {
    if (!item || typeof item !== "object") return item;
    const o = item as Record<string, unknown>;
    if (!isStorageBackedChatAttachment(o)) return item;
    return {
      type: "application/x-attachment-expired",
      name: (o.name as string) || "Attachment",
      url: "",
      expired: true,
      size: typeof o.size === "number" ? o.size : 0,
    };
  });
}
