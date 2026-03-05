/**
 * POST /api/admin/ranking/recompute
 * Recompute provider quality scores. Superadmin only.
 * Body: { provider_id?: string, full?: boolean, environment?: string }
 * - provider_id: recompute one provider
 * - full: true = recompute all active providers (batched)
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeQualityScoreForProvider } from "@/lib/ranking/quality-score";

const BATCH_SIZE = 100;
const ENVS = ["production", "staging", "development"];

function parseEnv(s: string | null | undefined): string {
  if (s && ENVS.includes(s)) return s;
  return "production";
}

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const body = await request.json().catch(() => ({}));
    const providerId = body.provider_id as string | undefined;
    const full = Boolean(body.full);
    const environment = parseEnv(body.environment);

    const supabase = getSupabaseAdmin();

    const { data: config } = await supabase
      .from("ranking_module_config")
      .select("weights")
      .eq("environment", environment)
      .maybeSingle();

    const weights = (config?.weights as Record<string, number>) ?? {};

    if (providerId) {
      const { computed_score, components } = await computeQualityScoreForProvider(
        supabase,
        providerId,
        weights
      );
      await supabase.from("provider_quality_score").upsert(
        {
          provider_id: providerId,
          computed_score,
          components: components as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider_id" }
      );
      return successResponse({ recomputed: 1, provider_id: providerId });
    }

    if (full) {
      const { data: ids } = await supabase
        .from("providers")
        .select("id")
        .eq("status", "active");
      const providerIds = (ids ?? []).map((p: any) => p.id) as string[];
      let recomputed = 0;
      for (let i = 0; i < providerIds.length; i += BATCH_SIZE) {
        const batch = providerIds.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (id) => {
            const { computed_score, components } = await computeQualityScoreForProvider(
              supabase,
              id,
              weights
            );
            await supabase.from("provider_quality_score").upsert(
              {
                provider_id: id,
                computed_score,
                components: components as unknown as Record<string, unknown>,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "provider_id" }
            );
            recomputed++;
          })
        );
      }
      return successResponse({ recomputed, message: `Recomputed ${recomputed} providers.` });
    }

    return successResponse({
      recomputed: 0,
      message: "Pass provider_id to recompute one provider, or full: true to recompute all.",
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to recompute ranking");
  }
}
