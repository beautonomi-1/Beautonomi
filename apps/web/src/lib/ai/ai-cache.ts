/**
 * AI response cache (ai_cache table). Server-only.
 */
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export function buildAiCacheKeyHash(
  featureKey: string,
  providerId: string,
  input: string,
): string {
  return createHash("sha256")
    .update(`${featureKey}:${providerId}:${input.trim()}`)
    .digest("hex");
}

export async function readAiCache<T = unknown>(
  keyHash: string,
): Promise<T | null> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("ai_cache")
    .select("response")
    .eq("key_hash", keyHash)
    .gt("expires_at", now)
    .maybeSingle();

  if (!data?.response) return null;
  return data.response as T;
}

export async function writeAiCache(params: {
  keyHash: string;
  featureKey: string;
  providerId: string;
  response: unknown;
  ttlSeconds: number;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + Math.max(params.ttlSeconds, 60) * 1000).toISOString();
  const supabase = getSupabaseAdmin();
  await supabase.from("ai_cache").upsert(
    {
      key_hash: params.keyHash,
      feature_key: params.featureKey,
      provider_id: params.providerId,
      response: params.response,
      expires_at: expiresAt,
    },
    { onConflict: "key_hash" },
  );
}
