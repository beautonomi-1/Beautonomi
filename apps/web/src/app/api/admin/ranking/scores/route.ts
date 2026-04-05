/**
 * GET /api/admin/ranking/scores
 * List provider quality scores for superadmin oversight.
 * Query: limit (default 50), offset (default 0), environment (default production)
 */

import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PLATFORM_CONFIG } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

const ENVS = ["production", "staging", "development"];

function parseEnv(s: string | null | undefined): string {
  if (s && ENVS.includes(s)) return s;
  return "production";
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PLATFORM_CONFIG, request);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: rows, error } = await supabase
      .from("provider_quality_score")
      .select("provider_id, computed_score, components, updated_at, providers!inner(tenant_id)")
      .eq("providers.tenant_id", tenantId)
      .order("computed_score", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    type ScoreRow = { provider_id: string; computed_score?: number; components?: unknown; updated_at?: string };
    type ProviderInfoRow = { id: string; business_name?: string | null; slug?: string | null };
    const providerIds = [...new Set((rows ?? []).map((r: ScoreRow) => r.provider_id))];
    const providerMap = new Map<string, { business_name: string | null; slug: string | null }>();
    if (providerIds.length > 0) {
        const { data: providers } = await supabase
        .from("providers")
        .select("id, business_name, slug")
        .eq("tenant_id", tenantId)
        .in("id", providerIds);
      (providers ?? []).forEach((p: ProviderInfoRow) => {
        providerMap.set(p.id, { business_name: p.business_name ?? null, slug: p.slug ?? null });
      });
    }

    const scores = (rows ?? []).map((r: ScoreRow) => {
      const info = providerMap.get(r.provider_id);
      return {
        provider_id: r.provider_id,
        business_name: info?.business_name ?? null,
        slug: info?.slug ?? null,
        computed_score: Number(r.computed_score),
        components: r.components ?? {},
        updated_at: r.updated_at,
      };
    });

    return successResponse({
      scores,
      limit,
      offset,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to fetch ranking scores");
  }
}
