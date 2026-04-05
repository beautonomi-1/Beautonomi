import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getProviderClients } from "@/app/api/provider/clients/route";
import { GET as getProviderClientsServiced } from "@/app/api/provider/clients/serviced/route";
import { GET as getProviderClientsConversations } from "@/app/api/provider/clients/conversations/route";
import { mergeProviderClientsListFromSources } from "@/lib/provider-portal/merge-provider-clients-list";

function apiMessage(json: unknown): string {
  if (!json || typeof json !== "object") return "Invalid response";
  const e = (json as { error?: { message?: string } | string }).error;
  if (typeof e === "object" && e?.message) return e.message;
  if (typeof e === "string") return e;
  return "Request failed";
}

async function parseJsonArray(res: Response): Promise<{ ok: boolean; data: unknown[]; error?: string }> {
  let json: { data?: unknown[]; error?: unknown } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return { ok: false, data: [], error: "Invalid JSON" };
  }
  if (!res.ok) {
    return { ok: false, data: [], error: apiMessage(json) };
  }
  const data = Array.isArray(json.data) ? json.data : [];
  return { ok: true, data };
}

/**
 * Default list (no location_id) — matches client before localStorage location applies.
 */
export async function fetchClientsInitial(): Promise<{
  clients: ReturnType<typeof mergeProviderClientsListFromSources> | null;
  error: string | null;
}> {
  try {
    const [savedRes, servicedRes, convRes] = await Promise.all([
      getProviderClients(await createNextRequestFromHeaders("/api/provider/clients")),
      getProviderClientsServiced(await createNextRequestFromHeaders("/api/provider/clients/serviced")),
      getProviderClientsConversations(await createNextRequestFromHeaders("/api/provider/clients/conversations")),
    ]);

    const saved = await parseJsonArray(savedRes);
    const serviced = await parseJsonArray(servicedRes);
    const conv = await parseJsonArray(convRes);

    const errors = [saved.error, serviced.error, conv.error].filter(Boolean) as string[];
    if (errors.length > 0) {
      return { clients: null, error: errors[0] };
    }

    const merged = mergeProviderClientsListFromSources(
      { data: saved.data },
      { data: serviced.data },
      { data: conv.data },
    );
    return { clients: merged, error: null };
  } catch (e) {
    return {
      clients: null,
      error: e instanceof Error ? e.message : "Failed to load clients",
    };
  }
}
