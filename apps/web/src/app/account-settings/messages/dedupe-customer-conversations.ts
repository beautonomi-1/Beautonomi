import {
  pickDisplayConversationThread,
  sortConversationsPinFirst,
} from "@/lib/messaging/conversation-pin";

export type CustomerConversationListItem = {
  id: string;
  booking_id?: string;
  provider_id?: string;
  customer_id: string;
  last_message_at: string;
  unread_count: number;
  provider_name?: string;
  provider_phone?: string;
  provider_email?: string;
  customer_name?: string;
  booking_number?: string;
  avatar?: string;
  last_message_preview?: string;
  is_pinned?: boolean;
};

/**
 * Matches client-side /account-settings/messages list shaping:
 * one non-booking thread per provider (most recent), all booking threads kept.
 */
export function dedupeCustomerConversations<T extends CustomerConversationListItem>(conversationsData: T[]): T[] {
  const deduplicated: T[] = [];
  const threadsByProvider = new Map<string, CustomerConversationListItem[]>();

  for (const conv of conversationsData) {
    if (!conv.booking_id && conv.provider_id) {
      const list = threadsByProvider.get(conv.provider_id) ?? [];
      list.push(conv);
      threadsByProvider.set(conv.provider_id, list);
    } else {
      deduplicated.push(conv);
    }
  }

  threadsByProvider.forEach((threads) => {
    const display = pickDisplayConversationThread(threads);
    const unreadTotal = threads.reduce((s, t) => s + (t.unread_count ?? 0), 0);
    deduplicated.push({
      ...display,
      unread_count: unreadTotal,
      is_pinned: threads.some((t) => t.is_pinned),
    } as T);
  });

  return sortConversationsPinFirst(deduplicated);
}
