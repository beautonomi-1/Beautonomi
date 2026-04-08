import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { z } from "zod";

const putBodySchema = z.object({
  features: z.array(z.string()),
});

/**
 * GET /api/admin/pricing-plans/[planId]/features
 * Bullet lines shown on the public /pricing page for this marketing card.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const { planId } = await params;
    const supabase = await getSupabaseServer(request);

    const { data: rows, error } = await supabase
      .from("pricing_plan_features")
      .select("id, feature_text, display_order")
      .eq("plan_id", planId)
      .order("display_order", { ascending: true });

    if (error) throw error;

    return successResponse(rows ?? []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch pricing plan features");
  }
}

/**
 * PUT /api/admin/pricing-plans/[planId]/features
 * Replace all bullet lines for this pricing plan (public /pricing marketing copy).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const { planId } = await params;
    const body = await request.json();
    const parsed = putBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Invalid body", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    const supabase = await getSupabaseServer(request);

    const { data: plan, error: planErr } = await supabase
      .from("pricing_plans")
      .select("id")
      .eq("id", planId)
      .maybeSingle();
    if (planErr) throw planErr;
    if (!plan) {
      return errorResponse("Pricing plan not found", "NOT_FOUND", 404);
    }

    const { error: delErr } = await supabase.from("pricing_plan_features").delete().eq("plan_id", planId);
    if (delErr) throw delErr;

    const lines = parsed.data.features.map((t) => t.trim()).filter(Boolean);
    if (lines.length === 0) {
      return successResponse({ replaced: 0 });
    }

    const insertRows = lines.map((feature_text, i) => ({
      plan_id: planId,
      feature_text,
      display_order: i,
    }));

    const { error: insErr } = await supabase.from("pricing_plan_features").insert(insertRows);
    if (insErr) throw insErr;

    return successResponse({ replaced: lines.length });
  } catch (error) {
    return handleApiError(error, "Failed to update pricing plan features");
  }
}
