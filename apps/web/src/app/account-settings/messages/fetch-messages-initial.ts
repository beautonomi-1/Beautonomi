import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getProfile } from "@/app/api/me/profile/route";
import { GET as getConversations } from "@/app/api/me/conversations/route";
import { dedupeCustomerConversations } from "./dedupe-customer-conversations";
import type { MessagesConversation, MessagesPageInitial } from "./messages-page-types";

export async function fetchMessagesPageInitial(): Promise<MessagesPageInitial | null> {
  const [reqProfile, reqConversations] = await Promise.all([
    createNextRequestFromHeaders("/api/me/profile"),
    createNextRequestFromHeaders("/api/me/conversations"),
  ]);

  const [resProfile, resConversations] = await Promise.all([getProfile(reqProfile), getConversations(reqConversations)]);

  if (!resProfile.ok) return null;

  const profileJson = (await resProfile.json().catch(() => ({}))) as { data?: { id?: string } };
  const userId = typeof profileJson.data?.id === "string" ? profileJson.data.id : "";
  if (!userId) return null;

  let raw: MessagesConversation[] = [];
  if (resConversations.ok) {
    const convJson = (await resConversations.json().catch(() => ({}))) as { data?: unknown };
    const d = convJson.data;
    raw = Array.isArray(d) ? (d as MessagesConversation[]) : [];
  }

  const conversations = dedupeCustomerConversations(raw);

  return { conversations, currentUserId: userId };
}
