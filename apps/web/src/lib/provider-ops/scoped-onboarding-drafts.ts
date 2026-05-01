import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { chunkIds, fetchAllPaged } from "./postgrest-unbounded";

const SCOPED_USER_CHUNK = 400;

/** User IDs visible to admin for this tenant (same rules as `/api/admin/users`). */
export async function loadTenantScopedUserIds(tenantId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("admin_user_ids_in_tenant_scope", {
    p_tenant_id: tenantId,
  });
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean);
}

/**
 * Paginates `provider_onboarding_drafts` for tenant-scoped users (chunked `.in(user_id, …)`).
 */
export async function fetchProviderOnboardingDraftsForTenantScope(
  selectClause: string,
  tenantId: string
): Promise<Record<string, unknown>[]> {
  const ids = await loadTenantScopedUserIds(tenantId);
  if (ids.length === 0) return [];

  const supabase = getSupabaseAdmin();
  const out: Record<string, unknown>[] = [];

  for (const idChunk of chunkIds(ids, SCOPED_USER_CHUNK)) {
    const batch = await fetchAllPaged<Record<string, unknown>>(async (from, to) => {
      const r = await supabase
        .from("provider_onboarding_drafts")
        .select(selectClause)
        .in("user_id", idChunk)
        .order("updated_at", { ascending: false })
        .range(from, to);
      return {
        data: (r.data ?? []) as unknown as Record<string, unknown>[] | null,
        error: r.error,
      };
    });
    out.push(...batch);
  }

  out.sort((a, b) =>
    String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))
  );
  return out;
}
