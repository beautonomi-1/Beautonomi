import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve ?ref= / attach payload to a referrer user id.
 * Order: canonical users.referral_code → legacy handle (exact) → full user id (UUID).
 */
export async function resolveReferrerUserId(
  supabase: SupabaseClient,
  rawCode: string,
): Promise<string | null> {
  const code = rawCode.trim();
  if (!code) return null;

  const { data: byRef } = await supabase
    .from("users")
    .select("id")
    .eq("referral_code", code)
    .maybeSingle();
  if (byRef && (byRef as { id?: string }).id) return (byRef as { id: string }).id;

  const { data: byHandle } = await supabase.from("users").select("id").eq("handle", code).maybeSingle();
  if (byHandle && (byHandle as { id?: string }).id) return (byHandle as { id: string }).id;

  if (UUID_RE.test(code)) {
    const { data: byId } = await supabase.from("users").select("id").eq("id", code).maybeSingle();
    if (byId && (byId as { id?: string }).id) return (byId as { id: string }).id;
  }

  return null;
}
