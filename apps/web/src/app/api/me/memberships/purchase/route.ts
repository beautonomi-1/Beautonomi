import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { createMembershipPurchase } from "@/app/api/me/membership/_helpers/purchase-membership";

const schema = z.object({
  plan_id: z.string().uuid(),
  campaign_id: z.string().optional(),
  source: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  referrer_path: z.string().optional(),
});

/**
 * POST /api/me/memberships/purchase
 * Body: { plan_id }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return errorResponse("Authentication required", "AUTH_REQUIRED", 401);

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);

    const result = await createMembershipPurchase({
      userId: user.id,
      userEmail: user.email,
      planId: parsed.data.plan_id,
      tenantId,
      attribution: {
        campaign_id: parsed.data.campaign_id,
        source: parsed.data.source ?? "partner_profile_memberships",
        utm_source: parsed.data.utm_source,
        utm_medium: parsed.data.utm_medium,
        utm_campaign: parsed.data.utm_campaign,
        referrer_path: parsed.data.referrer_path,
      },
    });

    return successResponse(result);
  } catch (error) {
    return handleApiError(error, "Failed to initialize membership purchase");
  }
}

