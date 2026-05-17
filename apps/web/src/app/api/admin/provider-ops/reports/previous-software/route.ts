import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/provider-ops/reports/previous-software
 *
 * Aggregates providers.previous_software and previous_software_other to show
 * which booking platforms providers migrated from when signing up.
 *
 * Response shape:
 *  {
 *    total_providers:   number;       // providers with any software answer
 *    none_count:        number;       // "none" / new to software
 *    by_software: Array<{
 *      slug:            string;
 *      display_name:    string;
 *      count:           number;
 *      pct:             number;       // percentage of responding providers
 *    }>;
 *    generated_at:      string;       // ISO timestamp
 *  }
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    // Fetch all providers that answered the previous-software question.
    const { data: rows, error } = await supabase
      .from("providers")
      .select("previous_software, previous_software_other")
      .eq("tenant_id", tenantId)
      .not("previous_software", "is", null);

    if (error) throw error;

    const providers = (rows ?? []) as Array<{
      previous_software: string | null;
      previous_software_other: string | null;
    }>;

    // Build a count map.
    const countMap: Record<string, number> = {};
    let noneCount = 0;
    for (const p of providers) {
      const raw = p.previous_software?.trim().toLowerCase() ?? "";
      if (!raw || raw === "null") continue;
      if (raw === "none") {
        noneCount++;
      } else if (raw === "other") {
        // Normalise the free-text slug for grouping.
        const freeText = (p.previous_software_other ?? "other")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_")
          .slice(0, 80)
          || "other";
        countMap[freeText] = (countMap[freeText] ?? 0) + 1;
      } else {
        countMap[raw] = (countMap[raw] ?? 0) + 1;
      }
    }

    const totalResponding = providers.length;
    const totalWithAnswer = totalResponding + noneCount; // noneCount already included in providers

    // Fetch canonical display names from the database where available.
    const { data: options } = await supabase
      .from("previous_software_options")
      .select("slug, name")
      .eq("is_active", true);

    const nameMap: Record<string, string> = {};
    for (const o of options ?? []) {
      nameMap[(o as { slug: string; name: string }).slug] = (o as { slug: string; name: string }).name;
    }

    const humanise = (slug: string): string =>
      nameMap[slug] ?? slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    const bySoftware = Object.entries(countMap)
      .sort(([, a], [, b]) => b - a)
      .map(([slug, count]) => ({
        slug,
        display_name: humanise(slug),
        count,
        pct: totalResponding > 0 ? Math.round((count / totalResponding) * 100) : 0,
      }));

    return successResponse({
      total_providers: totalResponding,
      none_count: noneCount,
      by_software: bySoftware,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch previous software report");
  }
}
