import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/**
 * Resolve a reported user from UUID or @handle (user_profiles.handle).
 */
export async function resolveReportedUserId(
  supabase: SupabaseClient,
  input: { reported_user_id?: string | null; reported_handle?: string | null },
): Promise<string | null> {
  const rawId = typeof input.reported_user_id === "string" ? input.reported_user_id.trim() : "";
  if (rawId && isUuid(rawId)) return rawId;

  const handle =
    typeof input.reported_handle === "string"
      ? input.reported_handle.trim().replace(/^@+/, "").toLowerCase()
      : "";
  if (!handle) return null;

  const { data } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("handle", handle)
    .maybeSingle();

  return (data as { user_id?: string } | null)?.user_id ?? null;
}
