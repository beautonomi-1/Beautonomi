import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { requireBrandDeskAccess, brandAccessErrorResponse } from "@/lib/brand-marketing/auth";
import { BRAND_BRIEF_TEMPLATES } from "@/lib/brand-marketing/templates";

const createSchema = z.object({
  name: z.string().min(1),
  objective: z.string().optional(),
  market_notes: z.string().optional(),
  budget_envelope: z.coerce.number().optional(),
  flight_start: z.string().optional(),
  flight_end: z.string().optional(),
  success_metric: z.enum(["demand", "supply"]).default("demand"),
  success_target: z.coerce.number().optional(),
  channels_requested: z.array(z.string()).default([]),
  line_mix: z.array(z.string()).default([]),
  template_key: z.enum(["city_launch", "seasonal_offer", "provider_acquisition"]).optional(),
  status: z.enum(["draft", "submitted"]).default("draft"),
  group_code: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("brand_briefs")
      .select("*")
      .eq("tenant_id", access.tenantId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return successResponse({ items: data ?? [], templates: BRAND_BRIEF_TEMPLATES });
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to list brand briefs");
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireBrandDeskAccess(request);
    const denied = brandAccessErrorResponse(access);
    if (denied) return denied;
    if (!access.tenantId) return errorResponse("Pick a market", "TENANT_REQUIRED", 400);

    const body = createSchema.parse(await request.json());
    const template = body.template_key ? BRAND_BRIEF_TEMPLATES[body.template_key] : null;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("brand_briefs")
      .insert({
        tenant_id: access.tenantId,
        name: body.name,
        objective: body.objective ?? template?.objective,
        market_notes: body.market_notes,
        budget_envelope: body.budget_envelope,
        flight_start: body.flight_start,
        flight_end: body.flight_end,
        success_metric: body.success_metric ?? template?.success_metric ?? "demand",
        success_target: body.success_target,
        channels_requested: body.channels_requested.length
          ? body.channels_requested
          : (template?.channels_requested ?? []),
        line_mix: body.line_mix.length ? body.line_mix : (template?.line_mix ?? []),
        template_key: body.template_key,
        status: body.status,
        group_code: body.group_code,
        author_id: access.user.id,
      })
      .select("*")
      .single();
    if (error) throw error;
    return successResponse(data);
  } catch (error) {
    const denied = brandAccessErrorResponse(error);
    if (denied) return denied;
    return handleApiError(error, "Failed to create brand brief");
  }
}
