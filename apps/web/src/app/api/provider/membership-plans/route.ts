import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, errorResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

const planSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  price_monthly: z.number().min(0),
  currency: z.string().min(3).max(6).optional(),
  discount_percent: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
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
    return successResponse({ plans: data || [] });
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

    const body = await request.json();
    const parsed = planSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);
    }

    const payload = parsed.data;
    const { data: row, error } = await (supabase.from("membership_plans") as any)
      .insert({
        provider_id: providerId,
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        price_monthly: payload.price_monthly,
        currency: payload.currency || "ZAR",
        discount_percent: payload.discount_percent ?? 0,
        is_active: payload.is_active ?? true,
      })
      .select("*")
      .single();

    if (error || !row) throw error || new Error("Failed to create plan");
    return successResponse(row);
  } catch (error) {
    return handleApiError(error, "Failed to create membership plan");
  }
}

