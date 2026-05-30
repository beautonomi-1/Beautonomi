/** Conversation list item with optional pin flag (API: is_pinned, DB: is_starred_*). */
export type PinnableConversation = {
  is_pinned?: boolean;
  last_message_at?: string | null;
};

export function sortConversationsPinFirst<T extends PinnableConversation>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pinDiff = (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);
    if (pinDiff !== 0) return pinDiff;
    return (
      new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
    );
  });
}

/** Prefer pinned thread, then general (no booking), then most recent. */
export function pickDisplayConversationThread<
  T extends PinnableConversation & { booking_id?: string | null },
>(threads: T[]): T {
  const pinned = threads.find((t) => t.is_pinned);
  if (pinned) return pinned;
  const general = threads.find((t) => t.booking_id == null);
  const latest = threads
    .slice()
    .sort(
      (a, b) =>
        new Date(b.last_message_at ?? 0).getTime() - new Date(a.last_message_at ?? 0).getTime()
    )[0];
  return general ?? latest;
}

export function mergePinnedFlagForThreads<T extends PinnableConversation>(threads: T[]): boolean {
  return threads.some((t) => Boolean(t.is_pinned));
}
