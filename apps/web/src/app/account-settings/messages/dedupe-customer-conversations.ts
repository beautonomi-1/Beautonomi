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
};

/**
 * Matches client-side /account-settings/messages list shaping:
 * one non-booking thread per provider (most recent), all booking threads kept.
 */
export function dedupeCustomerConversations<T extends CustomerConversationListItem>(conversationsData: T[]): T[] {
  const deduplicated: T[] = [];
  const providerMap = new Map<string, T>();

  for (const conv of conversationsData) {
    if (!conv.booking_id && conv.provider_id) {
      const existing = providerMap.get(conv.provider_id);
      if (!existing || new Date(conv.last_message_at) > new Date(existing.last_message_at)) {
        providerMap.set(conv.provider_id, conv);
      }
    } else {
      deduplicated.push(conv);
    }
  }

  providerMap.forEach((conv) => deduplicated.push(conv));

  deduplicated.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

  return deduplicated;
}
