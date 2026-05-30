import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeMessageAttachmentsForResponse } from "@/lib/messaging/message-attachments";

export type MessageReplyTo = {
  id: string;
  sender_id: string;
  sender_name: string;
  content_preview: string;
};

type RawMessageRow = {
  id: string;
  conversation_id?: string;
  sender_id: string;
  sender_role?: string;
  content?: string | null;
  attachments?: unknown;
  created_at?: string;
  reply_to_message_id?: string | null;
};

/** Short preview for quoted / reply UI. */
export function buildMessageContentPreview(
  content: string | null | undefined,
  attachments: unknown
): string {
  const text = (content ?? "").trim();
  if (text) {
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  }
  const list = Array.isArray(attachments) ? attachments : [];
  if (list.length === 0) return "";
  const first = list[0] as { type?: string; name?: string } | undefined;
  const type = first?.type ?? "";
  if (type === "custom_offer") return "Custom offer";
  if (type === "custom_request") return "Custom request";
  if (type === "custom_offer_paid") return "Payment received";
  if (typeof type === "string" && type.startsWith("image/")) return "Photo";
  if (typeof type === "string" && type.startsWith("video/")) return "Video";
  if (first?.name) return first.name;
  return "Attachment";
}

export async function validateReplyToMessageId(
  admin: SupabaseClient,
  conversationId: string,
  replyToMessageId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await admin
    .from("messages")
    .select("id")
    .eq("id", replyToMessageId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (error) {
    return { ok: false, message: "Could not validate reply target" };
  }
  if (!data) {
    return { ok: false, message: "Reply target message not found in this conversation" };
  }
  return { ok: true };
}

/** Attach `reply_to` preview objects for messages that reference a parent. */
export async function enrichMessagesWithReplyTo<T extends RawMessageRow>(
  admin: SupabaseClient,
  messages: T[],
  options?: {
    providerBusinessName?: string | null;
  }
): Promise<(T & { reply_to?: MessageReplyTo | null })[]> {
  const replyIds = [
    ...new Set(
      messages
        .map((m) => m.reply_to_message_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  if (replyIds.length === 0) {
    return messages.map((m) => ({ ...m, reply_to: null }));
  }

  const { data: parents, error } = await admin
    .from("messages")
    .select(
      `id, sender_id, sender_role, content, attachments, created_at,
       sender:users!messages_sender_id_fkey(id, full_name)`
    )
    .in("id", replyIds);

  if (error || !parents?.length) {
    return messages.map((m) => ({ ...m, reply_to: null }));
  }

  const parentById = new Map<string, MessageReplyTo>();
  const providerName =
    typeof options?.providerBusinessName === "string" && options.providerBusinessName.trim()
      ? options.providerBusinessName.trim()
      : null;

  for (const row of parents as Array<{
    id: string;
    sender_id: string;
    sender_role?: string;
    content?: string | null;
    attachments?: unknown;
    created_at?: string;
    sender?: { full_name?: string | null } | null;
  }>) {
    const senderName =
      row.sender_role !== "customer" && providerName
        ? providerName
        : row.sender?.full_name?.trim() || "User";
    parentById.set(row.id, {
      id: row.id,
      sender_id: row.sender_id,
      sender_name: senderName,
      content_preview: buildMessageContentPreview(
        row.content,
        sanitizeMessageAttachmentsForResponse(
          (row.attachments as unknown[]) ?? [],
          row.created_at ?? new Date().toISOString()
        )
      ),
    });
  }

  return messages.map((m) => ({
    ...m,
    reply_to: m.reply_to_message_id ? parentById.get(m.reply_to_message_id) ?? null : null,
  }));
}

export function mapMessageWithReplyFields(
  msg: RawMessageRow & { reply_to?: MessageReplyTo | null },
  base: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...base,
    reply_to_message_id: msg.reply_to_message_id ?? null,
    reply_to: msg.reply_to ?? null,
  };
}
