/**
 * GET /api/public/ranking/score?provider_id=...
 * Returns provider quality score when ranking module is enabled. Public (no auth).
 */

import { NextRequest } from "next/server";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function parseEnv(s: string | null): string {
  const ENVS = ["production", "staging", "development"];
  if (s && ENVS.includes(s)) return s;
  return "production";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");
    const environment = parseEnv(searchParams.get("environment"));

    if (!providerId) {
      return errorResponse("provider_id is required", "BAD_REQUEST", 400);
    }

    const supabase = getSupabaseAdmin();

    const { data: config } = await supabase
      .from("ranking_module_config")
      .select("enabled")
      .eq("environment", environment)
      .maybeSingle();

    if (!config?.enabled) {
      return errorResponse("Ranking module is disabled", "DISABLED", 403);
    }

    const { data: score, error } = await supabase
      .from("provider_quality_score")
      .select("provider_id, computed_score, components, updated_at")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) throw error;

    if (!score) {
      return successResponse({
        provider_id: providerId,
        computed_score: 0,
        components: {},
        updated_at: null,
      });
    }

    return successResponse({
      provider_id: score.provider_id,
      computed_score: Number(score.computed_score),
      components: score.components ?? {},
      updated_at: score.updated_at,
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to get ranking score");
  }
}
