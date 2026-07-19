/**
 * POST /api/admin/control-plane/integrations/stripe/test
 * Lightweight connectivity test (account retrieve).
 */
import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { getStripeClient } from "@/lib/payments/stripe-server";

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const body = await request.json().catch(() => ({}));
    const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : null;

    const stripe = await getStripeClient(tenantId);
    const account = await stripe.accounts.retrieve();
    return successResponse({
      ok: true,
      account_id: account.id,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe test failed";
    return errorResponse(message, "STRIPE_TEST_FAILED", 502);
  }
}
