/**
 * In-memory + AsyncStorage cache for chat messages and conversation list.
 * Scoped by userId. Signed attachment URLs expire (~1h); always revalidate over the network.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_MESSAGES = "beautonomi.messagingCache.messages.v1";
const STORAGE_CONVERSATIONS = "beautonomi.messagingCache.conversations.v1";
const MAX_MESSAGES_PER_CONVERSATION = 50;
const PERSIST_MS = 7 * 24 * 60 * 60 * 1000;

type MessagesEntry = {
  userId: string;
  conversationId: string;
  messages: unknown[];
  ts: number;
};

type ConversationsEntry = {
  userId: string;
  conversations: unknown[];
  ts: number;
};

const messagesByKey = new Map<string, MessagesEntry>();
let conversationsEntry: ConversationsEntry | null = null;

let hydrated = false;
let hydrationPromise: Promise<void> | null = null;

function msgKey(userId: string, conversationId: string): string {
  return `${userId}:${conversationId}`;
}

function isFresh(ts: number): boolean {
  return Date.now() - ts < PERSIST_MS;
}

function hydrate(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    try {
      const [rawMsg, rawConv] = await Promise.all([
        AsyncStorage.getItem(STORAGE_MESSAGES),
        AsyncStorage.getItem(STORAGE_CONVERSATIONS),
      ]);
      if (rawMsg) {
        const parsed = JSON.parse(rawMsg) as Record<string, MessagesEntry>;
        if (parsed && typeof parsed === "object") {
          for (const [key, entry] of Object.entries(parsed)) {
            if (
              entry &&
              typeof entry.userId === "string" &&
              typeof entry.conversationId === "string" &&
              Array.isArray(entry.messages) &&
              typeof entry.ts === "number" &&
              isFresh(entry.ts)
            ) {
              messagesByKey.set(key, entry);
            }
          }
        }
      }
      if (rawConv) {
        const parsed = JSON.parse(rawConv) as Partial<ConversationsEntry>;
        if (
          parsed &&
          typeof parsed.userId === "string" &&
          Array.isArray(parsed.conversations) &&
          typeof parsed.ts === "number" &&
          isFresh(parsed.ts)
        ) {
          conversationsEntry = parsed as ConversationsEntry;
        }
      }
    } catch {
      // corrupt storage
    } finally {
      hydrated = true;
      hydrationPromise = null;
    }
  })();
  return hydrationPromise;
}

void hydrate();

function persistMessagesMap(): void {
  const obj: Record<string, MessagesEntry> = {};
  messagesByKey.forEach((v, k) => {
    obj[k] = v;
  });
  void AsyncStorage.setItem(STORAGE_MESSAGES, JSON.stringify(obj)).catch(() => {});
}

export function getCachedMessagesPage<T>(
  userId: string | undefined,
  conversationId: string | undefined,
): T[] | null {
  if (!userId?.trim() || !conversationId?.trim()) return null;
  const entry = messagesByKey.get(msgKey(userId, conversationId));
  if (!entry || !isFresh(entry.ts)) return null;
  return entry.messages as T[];
}

export function setCachedMessagesPage(
  userId: string,
  conversationId: string,
  messages: unknown[],
): void {
  const capped = messages.slice(-MAX_MESSAGES_PER_CONVERSATION);
  const entry: MessagesEntry = {
    userId,
    conversationId,
    messages: capped,
    ts: Date.now(),
  };
  messagesByKey.set(msgKey(userId, conversationId), entry);
  persistMessagesMap();
}

export function appendCachedMessage(userId: string, conversationId: string, message: unknown): void {
  const key = msgKey(userId, conversationId);
  const prev = messagesByKey.get(key);
  const list = prev?.messages ? [...prev.messages] : [];
  list.push(message);
  setCachedMessagesPage(userId, conversationId, list);
}

export function getCachedConversations<T>(userId: string | undefined): T[] | null {
  if (!userId?.trim()) return null;
  if (!conversationsEntry || conversationsEntry.userId !== userId || !isFresh(conversationsEntry.ts)) {
    return null;
  }
  return conversationsEntry.conversations as T[];
}

export function setCachedConversations(userId: string, conversations: unknown[]): void {
  conversationsEntry = { userId, conversations, ts: Date.now() };
  void AsyncStorage.setItem(STORAGE_CONVERSATIONS, JSON.stringify(conversationsEntry)).catch(() => {});
}

export function clearMessagingCache(): void {
  messagesByKey.clear();
  conversationsEntry = null;
  void AsyncStorage.multiRemove([STORAGE_MESSAGES, STORAGE_CONVERSATIONS]).catch(() => {});
}
