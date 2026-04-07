import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves `[id]` route params for provider staff APIs.
 * Accepts either `provider_staff.id` or `provider_staff.user_id` (app user id) for the same tenant.
 */
export async function resolveProviderStaffRowId(
  supabase: SupabaseClient,
  providerId: string,
  routeParamId: string
): Promise<string | null> {
  const { data: byPk } = await supabase
    .from("provider_staff")
    .select("id")
    .eq("id", routeParamId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (byPk?.id) return byPk.id as string;

  const { data: byUser } = await supabase
    .from("provider_staff")
    .select("id")
    .eq("user_id", routeParamId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (byUser?.id) return byUser.id as string;

  return null;
}
