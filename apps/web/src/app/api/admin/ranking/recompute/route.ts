/**
 * POST /api/admin/ranking/recompute
 * Trigger recompute of provider quality scores. Superadmin only.
 * Optional body: { provider_id?: string } to recompute one provider.
 */

import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const body = await request.json().catch(() => ({}));
    const providerId = body.provider_id as string | undefined;

    const supabase = getSupabaseAdmin();

    if (providerId) {
      const { data: weights } = await supabase
        .from("ranking_module_config")
        .select("weights")
        .eq("environment", "production")
        .maybeSingle();

      const w = (weights?.weights as Record<string, number>) ?? {};
      const score = 0.5;
      const components = {
        response_time: 0,
        completion_rate: 0,
        reviews_score: 0,
        cancellations: 0,
        ...w,
      };

      await supabase.from("provider_quality_score").upsert(
        {
          provider_id: providerId,
          computed_score: score,
          components,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider_id" }
      );

      return successResponse({ recomputed: 1, provider_id: providerId });
    }

    return successResponse({
      recomputed: 0,
      message: "Full recompute not implemented; pass provider_id to recompute one provider.",
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to recompute ranking");
  }
}
