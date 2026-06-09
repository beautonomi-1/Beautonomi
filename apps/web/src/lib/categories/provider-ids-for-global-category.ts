import "server-only";
import { isProviderPubliclyVisible } from "@/lib/providers/public-provider-visibility";

type CategoryProviderJoinRow = {
  provider_id?: string;
  providers?: { tenant_id?: string; status?: string; deleted_at?: string | null } | Array<{
    tenant_id?: string;
    status?: string;
    deleted_at?: string | null;
  }>;
};

function providerJoinIsPublic(row: CategoryProviderJoinRow): boolean {
  const joined = row.providers;
  const provider = Array.isArray(joined) ? joined[0] : joined;
  return isProviderPubliclyVisible(provider);
}

/**
 * Provider discovery for a global_service_categories row — must stay aligned with
 * GET /api/public/search when `category` filter is set: union of
 * `provider_global_category_associations` and providers with active offerings
 * whose `category_id` points at the global category.
 */
export async function getProviderIdsForGlobalCategory(args: {
  supabase: any;
  globalCategoryId: string;
  tenantId: string;
}): Promise<string[]> {
  const { supabase, globalCategoryId, tenantId } = args;

  const [{ data: associationRows }, { data: offeringRows }] = await Promise.all([
    supabase
      .from("provider_global_category_associations")
      .select("provider_id, providers!inner(tenant_id, status, deleted_at)")
      .eq("global_category_id", globalCategoryId)
      .eq("providers.tenant_id", tenantId)
      .eq("providers.status", "active")
      .is("providers.deleted_at", null),
    supabase
      .from("offerings")
      .select("provider_id, providers!inner(tenant_id, status, deleted_at)")
      .eq("category_id", globalCategoryId)
      .eq("is_active", true)
      .eq("providers.tenant_id", tenantId)
      .eq("providers.status", "active")
      .is("providers.deleted_at", null),
  ]);

  const rows = [
    ...((associationRows ?? []) as CategoryProviderJoinRow[]),
    ...((offeringRows ?? []) as CategoryProviderJoinRow[]),
  ];

  return [
    ...new Set(
      rows
        .filter(providerJoinIsPublic)
        .map((row) => row.provider_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}
