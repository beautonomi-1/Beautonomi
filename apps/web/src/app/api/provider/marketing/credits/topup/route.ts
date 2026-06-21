import { NextRequest } from "next/server";
import { z } from "zod";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { convertToSmallestUnit } from "@/lib/payments/paystack";
import { initializePaystackTransaction } from "@/lib/payments/paystack-server";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { checkMarketingFeatureAccess } from "@/lib/subscriptions/feature-access";

const schema = z.object({
  amount_zar: z.coerce.number().min(10, "Minimum top-up is R10"),
  callback_url: z.string().optional(),
});

/**
 * POST /api/provider/marketing/credits/topup
 * Initialize Paystack payment for marketing credit purchase.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const marketingAccess = await checkMarketingFeatureAccess(providerId, supabase);
    if (!marketingAccess.usePlatformCredentials) {
      return errorResponse(
        "Marketing credit top-ups are only available when your plan includes Beautonomi platform sending. Use your own integrations or ask your admin to enable platform sending.",
        "SUBSCRIPTION_REQUIRED",
        403,
      );
    }

    const body = schema.parse(await request.json());

    const { data: userRow } = await supabase
      .from("users")
      .select("email, preferred_currency")
      .eq("id", user.id)
      .single();

    const email = (userRow as { email?: string | null })?.email;
    if (!email) return errorResponse("User email is required", "VALIDATION_ERROR", 400);

    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = tenantId ? await getTenantRegionConfig(tenantId) : null;
    const currency =
      (userRow as { preferred_currency?: string | null })?.preferred_currency ||
      tenantRegion?.defaultCurrency ||
      LAST_RESORT_CURRENCY;

    const amountZar = Number(body.amount_zar);
    const reference = `marketing_topup_${providerId}_${Date.now()}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const callbackFromClient = body.callback_url?.trim();
    const callbackUrl =
      callbackFromClient && (callbackFromClient.startsWith("provider://") || callbackFromClient.startsWith("exp://"))
        ? `${callbackFromClient}${callbackFromClient.includes("?") ? "&" : "?"}payment_type=marketing_topup`
        : `${appUrl}/provider/settings/marketing-integrations?topup=success`;

    const paystackData = await initializePaystackTransaction({
      email,
      amountInSmallestUnit: convertToSmallestUnit(amountZar),
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        marketing_credit_topup: true,
        provider_id: providerId,
        amount_zar: amountZar,
        currency,
        tenant_id: tenantId,
      },
      tenantId,
    });

    const paymentUrl = paystackData?.data?.authorization_url || null;
    if (!paymentUrl) {
      return errorResponse("Failed to initialize Paystack payment", "PAYSTACK_ERROR", 502);
    }

    return successResponse({
      payment_url: paymentUrl,
      paystack_reference: reference,
      amount_zar: amountZar,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleApiError(error, "Invalid request data", "VALIDATION_ERROR", 400);
    }
    return handleApiError(error, "Failed to initialize marketing credit top-up");
  }
}
