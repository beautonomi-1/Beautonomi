import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import { initializeOnlinePayment } from "@/lib/payments/online-payment";
import {
  paystackChannelsForInitialize,
  resolveHostedCheckoutCallbacks,
} from "@/lib/payments/resolve-paystack-hosted-callback";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { z } from "zod";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { getPaymentProviderForTenant } from "@/lib/payments/provider/registry";

const callbackUrlSchema = z
  .string()
  .min(1)
  .refine(
    (s) => /^https?:\/\//i.test(s) || s.startsWith("customer://") || s.startsWith("exp://"),
    { message: "callback_url must be an http(s), customer://, or exp:// URL" },
  );

const bodySchema = z.object({
  set_as_default: z.boolean().optional(),
  callback_url: callbackUrlSchema.optional(),
});

/**
 * POST /api/me/payment-methods/initialize-verification
 *
 * Start a small temporary charge (e.g. R1) to verify and save a card without a booking.
 * Paystack: small verification charge; Stripe: Checkout in setup mode (no charge).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    const { set_as_default, callback_url } = parsed.success ? parsed.data : { set_as_default: false, callback_url: undefined };

    // Get user email (required by Paystack)
    const { data: userRow } = await supabase
      .from("users")
      .select("email")
      .eq("id", user.id)
      .single();
    const email = (userRow as any)?.email ?? (user as any).email;
    if (!email || typeof email !== "string") {
      return errorResponse("Email is required to add a card. Please set your email in account settings.", "VALIDATION_ERROR", 400);
    }

    const currency = lastResortCurrency;
    const amountInCurrency = 1; // R1 (or minimum) for verification
    const amountInSmallestUnit = convertToSmallestUnit(amountInCurrency, currency);
    const reference = generateTransactionReference("card_verify", user.id);

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com").replace(/\/$/, "");
    const hosted = resolveHostedCheckoutCallbacks({
      baseUrl,
      clientCallbackUrl: callback_url,
      defaultSuccessPath: "/account-settings/payments",
      defaultCancelPath: "/account-settings/payments",
      query: { card_verified: "1" },
    });
    const cardCancelAction = `${baseUrl}/account-settings/payments?card_verification_cancelled=1${hosted.inApp ? "&context=app" : ""}`;

    const psp = await getPaymentProviderForTenant(tenantId);
    const gateway = (psp?.provider.id ?? "paystack").toLowerCase();
    const channelExtras = paystackChannelsForInitialize({ saveCard: true });
    const onlineInit = await initializeOnlinePayment({
      tenantId,
      email,
      amountInSmallestUnit: gateway === "stripe" ? 0 : amountInSmallestUnit,
      currency,
      reference,
      callbackUrl: hosted.successUrl,
      lineItemName: "Card verification",
      saveCard: true,
      mode: gateway === "stripe" ? "setup" : "payment",
      metadata: {
        customer_id: user.id,
        save_card: true,
        set_as_default: set_as_default ?? false,
        kind: "card_verification",
        cancel_action: cardCancelAction,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
      ...(gateway === "paystack" && channelExtras.channels
        ? { channels: channelExtras.channels }
        : {}),
    });

    return successResponse({
      authorization_url: onlineInit.authorizationUrl ?? "",
      access_code: onlineInit.accessCode ?? "",
      reference: onlineInit.reference,
    });
  } catch (error) {
    return handleApiError(error, "Failed to start card verification");
  }
}
