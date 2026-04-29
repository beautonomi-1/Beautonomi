import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, errorResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isSalonMembershipEntitledForDiscount } from "@/lib/provider/salon-membership-entitlement";

const planSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  price_monthly: z.number().min(0),
  currency: z.string().min(3).max(6).optional(),
  discount_percent: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
  benefits: z.array(z.string()).optional(),
});

/**
 * GET /api/provider/membership-plans
 * POST /api/provider/membership-plans
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const { searchParams } = new URL(request.url);
    const providerIdParam = searchParams.get("provider_id"); // For superadmin to view specific provider

    // For superadmin, allow viewing any provider's plans
    let providerId: string | null = null;
    if (user.role === "superadmin" && providerIdParam) {
      providerId = providerIdParam;
    } else {
      // For providers, get their own provider ID
      providerId = await getProviderIdForUser(user.id, supabase);
      if (!providerId) return notFoundResponse("Provider not found");
    }

    let query = (supabase.from("membership_plans") as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data, error } = await query;

    if (error) throw error;
    const plans = data || [];

    // RLS on `user_memberships` only allows the end customer to see their row.
    // Enrich plan stats with an admin read scoped to this provider.
    if (plans.length > 0) {
      const planIds = plans.map((p: { id: string }) => p.id).filter(Boolean);
      const admin = getSupabaseAdmin();
      let countQuery = (admin as any)
        .from("user_memberships")
        .select("plan_id, status, expires_at")
        .eq("status", "active")
        .in("plan_id", planIds);
      if (providerId) {
        countQuery = countQuery.eq("provider_id", providerId);
      }
      const { data: activeRows, error: countError } = await countQuery;
      if (countError) {
        console.error("[membership-plans] subscriber count query failed", countError);
      } else {
        const planMeta = new Map<string, { is_active: boolean }>();
        for (const p of plans as { id: string; is_active?: boolean }[]) {
          planMeta.set(p.id, { is_active: p.is_active !== false });
        }
        const countByPlan = new Map<string, number>();
        for (const row of activeRows || []) {
          const r = row as { plan_id: string; status: string; expires_at: string | null };
          const meta = planMeta.get(r.plan_id);
          const planIsActive = meta?.is_active ?? true;
          if (
            !isSalonMembershipEntitledForDiscount({
              status: r.status,
              expires_at: r.expires_at,
              planIsActive,
            })
          ) {
            continue;
          }
          countByPlan.set(r.plan_id, (countByPlan.get(r.plan_id) || 0) + 1);
        }
        for (const p of plans as any[]) {
          const c = countByPlan.get(p.id) ?? 0;
          p.subscriber_count = c;
          const price = Number(p.price_monthly) || 0;
          p.monthly_revenue = Math.round(price * c * 100) / 100;
        }
        return successResponse({ plans });
      }
    }

    return successResponse({ plans });
  } catch (error) {
    return handleApiError(error, "Failed to fetch membership plans");
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check permission to edit settings
    const permissionCheck = await requirePermission('edit_settings', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      (prow as { tenant_id?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const body = await request.json();
    const parsed = planSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    const payload = parsed.data;
    const benefitsPayload =
      payload.benefits && payload.benefits.length > 0 ? payload.benefits : [];
    const { data: row, error } = await (supabase.from("membership_plans") as any)
      .insert({
        provider_id: providerId,
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        price_monthly: payload.price_monthly,
        currency: payload.currency || lastResortCurrency,
        discount_percent: payload.discount_percent ?? 0,
        is_active: payload.is_active ?? true,
        benefits: benefitsPayload,
      })
      .select("*")
      .single();

    if (error || !row) throw error || new Error("Failed to create plan");
    return successResponse(row);
  } catch (error) {
    return handleApiError(error, "Failed to create membership plan");
  }
}

