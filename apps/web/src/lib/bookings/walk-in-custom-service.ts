import type { SupabaseClient } from "@supabase/supabase-js";

const WALK_IN_CUSTOM_SLUG = "__walk_in_custom__";

/**
 * Ensures a hidden per-provider offering used for ad-hoc walk-in custom service lines.
 */
export async function ensureWalkInCustomOffering(
  supabase: SupabaseClient,
  providerId: string,
  currency: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from("offerings")
    .select("id")
    .eq("provider_id", providerId)
    .eq("title", "Walk-in custom service")
    .eq("is_active", false)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from("offerings")
    .insert({
      provider_id: providerId,
      title: "Walk-in custom service",
      description: "Internal placeholder for provider-entered custom walk-in services",
      duration_minutes: 60,
      price: 0,
      currency,
      is_active: false,
      supports_at_salon: true,
      supports_at_home: true,
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    throw new Error(error?.message ?? "Could not create custom service offering");
  }

  return created.id as string;
}

export function isWalkInCustomServiceInput(service: {
  isCustom?: boolean;
  customName?: string;
  name?: string;
}): boolean {
  return service.isCustom === true || !!(service.customName?.trim() || service.name?.trim());
}

export function walkInCustomServiceLabel(service: {
  customName?: string;
  name?: string;
}): string {
  return (service.customName ?? service.name ?? "Custom service").trim();
}

export { WALK_IN_CUSTOM_SLUG };
