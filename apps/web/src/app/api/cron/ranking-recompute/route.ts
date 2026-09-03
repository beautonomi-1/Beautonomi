/**
 * GET /api/cron/ranking-recompute
 *
 * Cron-callable endpoint to recompute all provider quality scores (production).
 * Secure with CRON_SECRET: Authorization: Bearer <CRON_SECRET>.
 *
 * Schedule e.g. daily via Vercel Cron or external cron.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeQualityScoreForProvider } from "@/lib/ranking/quality-score";
import { verifyCronRequest } from "@/lib/cron-auth";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

const BATCH_SIZE = 100;
const ENVIRONMENT = "production";
const JOB_NAME = "ranking-recompute";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return new Response(auth.error ?? "Unauthorized", { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error ?? "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    const { data: config } = await supabase
      .from("ranking_module_config")
      .select("weights")
      .eq("environment", ENVIRONMENT)
      .maybeSingle();

    const weights = (config?.weights as Record<string, number>) ?? {};

    const { data: ids } = await supabase
      .from("providers")
      .select("id")
      .eq("status", "active");
    const providerIds = (ids ?? []).map((p: { id: string }) => p.id) as string[];
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

    return successResponse({
      message: `Recomputed ${recomputed} providers (${ENVIRONMENT})`,
      recomputed,
      environment: ENVIRONMENT,
    });
  } catch (error) {
    return handleApiError(error as Error, "Ranking recompute cron failed");
  }
}
