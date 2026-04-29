import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleInApi, handleApiError, successResponse, errorResponse } from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { createMembershipPurchase } from "@/app/api/me/membership/_helpers/purchase-membership";

const schema = z.object({
  membership_id: z.string().uuid(),
  provider_id: z.string().uuid(),
  campaign_id: z.string().optional(),
  source: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  referrer_path: z.string().optional(),
});

/**
 * POST /api/me/membership/subscribe
 * Body: { membership_id (plan id), provider_id }
 * Returns: { payment: { authorization_url } } for customer app partner-profile Subscribe flow.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request
    );
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.issues);

    const { membership_id: planId, provider_id: providerId } = parsed.data;

    const result = await createMembershipPurchase({
      userId: user.id,
      userEmail: user.email,
      planId,
      expectedProviderId: providerId,
      tenantId,
      attribution: {
        campaign_id: parsed.data.campaign_id,
        source: parsed.data.source ?? "customer_app_partner_profile",
        utm_source: parsed.data.utm_source,
        utm_medium: parsed.data.utm_medium,
        utm_campaign: parsed.data.utm_campaign,
        referrer_path: parsed.data.referrer_path,
      },
    });

    return successResponse({
      order_id: result.order_id,
      reference: result.reference,
      status: result.status,
      payment: { authorization_url: result.payment_url },
    });
  } catch (error) {
    return handleApiError(error, "Failed to subscribe to membership");
  }
}
