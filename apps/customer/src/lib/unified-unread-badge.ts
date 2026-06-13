/** WhatsApp-style total: in-app notifications + chat unread. */
export function computeUnifiedUnread(notificationUnread: number, chatUnread: number): number {
  return Math.max(0, Math.floor(notificationUnread) + Math.floor(chatUnread));
}
