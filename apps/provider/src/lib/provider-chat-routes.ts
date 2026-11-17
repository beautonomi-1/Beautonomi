/** True when the user is in a 1:1 messaging thread (not the inbox list). */
export function isProviderChatThreadPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const isMessagingThread = Boolean(pathname.match(/\/more\/messaging\/[^/?#]+/));
  const isChatsThread = Boolean(pathname.match(/\/chats\/[^/?#]+/));
  return isMessagingThread || isChatsThread;
}