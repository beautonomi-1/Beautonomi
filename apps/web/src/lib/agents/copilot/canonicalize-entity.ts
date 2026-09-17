import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CopilotEntityType } from "./copilot-types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/** Resolve provider id or slug to canonical UUID + display label. */
export async function canonicalizeProviderId(
  tenantId: string,
  idOrSlug: string,
): Promise<{ id: string; label: string } | null> {
  const supabase = getSupabaseAdmin();
  const byId = isUuid(idOrSlug);
  const { data, error } = await supabase
    .from("providers")
    .select("id, business_name, slug")
    .eq("tenant_id", tenantId)
    .eq(byId ? "id" : "slug", idOrSlug)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; business_name?: string | null; slug?: string | null };
  const label = String(row.business_name || row.slug || row.id);
  return { id: row.id, label };
}

export async function canonicalizeEntityRef(
  tenantId: string,
  entityType: CopilotEntityType,
  entityId: string,
): Promise<{ entityId: string; label?: string } | null> {
  if (entityType === "provider") {
    const c = await canonicalizeProviderId(tenantId, entityId);
    return c ? { entityId: c.id, label: c.label } : null;
  }
  if (isUuid(entityId)) {
    return { entityId };
  }
  return null;
}
