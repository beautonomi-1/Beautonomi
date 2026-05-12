import "server-only";

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
      .select("provider_id, providers!inner(tenant_id, status)")
      .eq("global_category_id", globalCategoryId)
      .eq("providers.tenant_id", tenantId)
      .eq("providers.status", "active"),
    supabase
      .from("offerings")
      .select("provider_id, providers!inner(tenant_id, status)")
      .eq("category_id", globalCategoryId)
      .eq("is_active", true)
      .eq("providers.tenant_id", tenantId)
      .eq("providers.status", "active"),
  ]);

  return [
    ...new Set(
      [
        ...(associationRows ?? []).map((row: { provider_id?: string }) => row.provider_id),
        ...(offeringRows ?? []).map((row: { provider_id?: string }) => row.provider_id),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
}
