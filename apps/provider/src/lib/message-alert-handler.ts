export interface MessageConversationRow {
  id: string;
  unread_count_provider?: number | null;
  last_message_preview?: string | null;
  customer_name?: string | null;
}

export function shouldAlertForConversationUpdate(
  row: MessageConversationRow,
  previousUnread: number,
): boolean {
  const nextUnread = Number(row.unread_count_provider ?? 0);
  if (!row.id?.trim()) return false;
  return nextUnread > previousUnread && nextUnread > 0;
}

export function conversationAlertTitle(row: MessageConversationRow): string {
  const name = row.customer_name?.trim();
  return name ? `Message from ${name}` : "New message";
}

export function conversationAlertMessage(row: MessageConversationRow): string {
  const preview = row.last_message_preview?.trim();
  return preview || "You have a new client message.";
}
