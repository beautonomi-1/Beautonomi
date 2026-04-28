import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { z } from "zod";
import { fetchScopedListMerged, resolveAdminTenantContext } from "@/lib/tenant/scoped-overrides";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isBlankHtmlContent, sanitizePricingFeatureHtml } from "@/lib/html/pricing-feature-html";

const pricingPlanSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required"),
  price: z.string().min(1, "Price is required"),
  period: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  cta_text: z.string().default("Get started"),
  is_popular: z.boolean().default(false),
  display_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
  paystack_plan_code_monthly: z.string().nullable().optional(),
  paystack_plan_code_yearly: z.string().nullable().optional(),
  subscription_plan_id: z.string().uuid().nullable().optional(),
  currency: z.string().nullable().optional(),
});

/** PUT allows partial updates (e.g. deactivate + unlink from subscription plan). */
const pricingPlanUpdateSchema = pricingPlanSchema.partial().extend({
  id: z.string().uuid(),
  /** Replaces all bullet lines on the public pricing card when provided. */
  features: z.array(z.string()).optional(),
});

const pricingPlanCreateSchema = pricingPlanSchema.extend({
  features: z.array(z.string()).optional(),
});

async function syncPricingPlanFeatures(
  supabase: SupabaseClient,
  planId: string,
  features: string[]
): Promise<void> {
  await supabase.from("pricing_plan_features").delete().eq("plan_id", planId);
  const cleaned = features
    .map((t) => sanitizePricingFeatureHtml(String(t ?? "")))
    .filter((t) => !isBlankHtmlContent(t));
  if (cleaned.length === 0) return;
  const rows = cleaned.map((feature_text, display_order) => ({
    plan_id: planId,
    feature_text,
    display_order,
  }));
  const { error } = await supabase.from("pricing_plan_features").insert(rows);
  if (error) throw error;
}

/**
 * GET /api/admin/pricing-plans
 * Get all pricing plans (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const { currentTenantId } = await resolveAdminTenantContext(request, undefined, user.role ?? null);

    const scopedPlans = await fetchScopedListMerged<Record<string, unknown>>({
      supabase,
      table: "pricing_plans",
      tenantId: currentTenantId,
      select: "*",
      dedupeKey: (row) => String(row.name ?? row.id ?? ""),
      orderBy: { column: "display_order", ascending: true },
    });
    return successResponse(scopedPlans.data || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch pricing plans");
  }
}

/**
 * POST /api/admin/pricing-plans
 * Create a new pricing plan
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(request, body as Record<string, unknown>, user.role ?? null);
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const validationResult = pricingPlanCreateSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Invalid input data",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { features, ...insertRow } = validationResult.data;

    const { data: plan, error } = await supabase
      .from("pricing_plans")
      .insert({ ...insertRow, tenant_id: scopeTenantId })
      .select()
      .single();

    if (error) {
      return handleApiError(error, "Failed to create pricing plan");
    }

    if (plan && features !== undefined) {
      try {
        await syncPricingPlanFeatures(supabase, plan.id, features);
      } catch (e) {
        return handleApiError(e, "Failed to save pricing plan features");
      }
    }

    return successResponse(plan);
  } catch (error) {
    return handleApiError(error, "Failed to create pricing plan");
  }
}

/**
 * PUT /api/admin/pricing-plans
 * Update a pricing plan
 */
export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const { currentTenantId, requestedScope } = await resolveAdminTenantContext(request, body as Record<string, unknown>, user.role ?? null);
    const scopeTenantId = requestedScope.scope === "global" ? null : requestedScope.tenantId ?? currentTenantId;

    const validationResult = pricingPlanUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Invalid input data",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues
      );
    }

    const { id, features, ...updateData } = validationResult.data;

    const { data: plan, error } = await supabase
      .from("pricing_plans")
      .update(updateData)
      .eq("id", id)
      .or(`tenant_id.eq.${scopeTenantId},tenant_id.is.null`)
      .select()
      .single();

    if (error) {
      return handleApiError(error, "Failed to update pricing plan");
    }

    if (plan && features !== undefined) {
      try {
        await syncPricingPlanFeatures(supabase, id, features);
      } catch (e) {
        return handleApiError(e, "Failed to update pricing plan features");
      }
    }

    return successResponse(plan);
  } catch (error) {
    return handleApiError(error, "Failed to update pricing plan");
  }
}
