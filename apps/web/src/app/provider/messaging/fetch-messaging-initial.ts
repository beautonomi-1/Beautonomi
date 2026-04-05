import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getProviderConversations } from "@/app/api/provider/conversations/route";

function apiMessage(json: unknown): string {
  if (!json || typeof json !== "object") return "Invalid response";
  const e = (json as { error?: { message?: string } | string }).error;
  if (typeof e === "object" && e?.message) return e.message;
  if (typeof e === "string") return e;
  return "Request failed";
}

/**
 * Server load for /provider/messaging — same payload as GET /api/provider/conversations.
 */
export async function fetchMessagingInitial(): Promise<{
  conversations: unknown[] | null;
  error: string | null;
}> {
  try {
    const req = await createNextRequestFromHeaders("/api/provider/conversations");
    const res = await getProviderConversations(req);
    let json: { data?: unknown; error?: unknown } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      return { conversations: null, error: "Invalid response from conversations API" };
    }
    if (!res.ok) {
      return { conversations: null, error: apiMessage(json) };
    }
    const raw = json.data;
    if (!Array.isArray(raw)) {
      return { conversations: [], error: null };
    }
    return { conversations: raw, error: null };
  } catch (e) {
    return {
      conversations: null,
      error: e instanceof Error ? e.message : "Failed to load conversations",
    };
  }
}
