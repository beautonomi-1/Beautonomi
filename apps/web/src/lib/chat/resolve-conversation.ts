import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolveConversationInput = {
  customerId: string;
  providerId: string;
  bookingId?: string | null;
  /** Used when creating a new conversation row. */
  lastMessageSenderId?: string;
};

export type ResolveConversationResult = {
  id: string;
  created: boolean;
};

/**
 * Returns the single customer↔provider conversation (one thread per pair).
 * Does NOT filter by booking_id — reuses the existing row regardless of scope.
 * Creates one when absent; back-fills booking_id when provided and missing.
 */
export async function resolveCustomerProviderConversation(
  admin: SupabaseClient,
  input: ResolveConversationInput,
): Promise<ResolveConversationResult> {
  const { customerId, providerId, bookingId, lastMessageSenderId } = input;

  const { data: existing, error: lookupError } = await admin
    .from("conversations")
    .select("id, booking_id")
    .eq("customer_id", customerId)
    .eq("provider_id", providerId)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (existing?.id) {
    if (bookingId && !existing.booking_id) {
      await admin
        .from("conversations")
        .update({ booking_id: bookingId, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
    return { id: existing.id, created: false };
  }

  const now = new Date().toISOString();
  const { data: created, error: createError } = await admin
    .from("conversations")
    .insert({
      booking_id: bookingId ?? null,
      customer_id: customerId,
      provider_id: providerId,
      last_message_at: now,
      last_message_preview: "",
      last_message_sender_id: lastMessageSenderId ?? customerId,
      unread_count_customer: 0,
      unread_count_provider: 0,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (createError) {
    throw createError;
  }

  return { id: created.id, created: true };
}

/**
 * Updates conversation metadata after a message insert.
 * Unread counts are managed by the DB trigger on messages INSERT — do not increment here.
 */
export async function updateConversationAfterMessage(
  admin: SupabaseClient,
  conversationId: string,
  senderId: string,
  preview: string,
): Promise<void> {
  await admin
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
      last_message_sender_id: senderId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}
