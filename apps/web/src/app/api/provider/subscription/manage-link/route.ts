import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getSubscriptionManageLink } from "@/lib/payments/paystack-complete";
import { getAppleBillingPaystackBlock } from "@/lib/iap/apple/ios-eligibility";
import { getSupabaseServer } from "@/lib/supabase/server";
import { createProviderStripeBillingPortalUrl } from "@/lib/payments/stripe-billing-portal";
import { pendingSavedCardChargeRefusal } from "@/lib/iap/apple/billing-active";

/**
 * GET /api/provider/subscription/manage-link
 *
 * Hosted self-serve billing: Paystack manage link or Stripe Customer Portal.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const providerId = await getProviderIdForUser(user.id, supabase, { request });

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const appleBilling = await getAppleBillingPaystackBlock(supabase, providerId);
    if (appleBilling.blocked) {
      return errorResponse(appleBilling.message, "APPLE_BILLING_ACTIVE", 409);
    }

    const { data: subscription } = await supabase
      .from("provider_subscriptions")
      .select(
        "id, status, billing_provider, paystack_subscription_code, stripe_customer_id, last_dunning_retry_at, dunning_retry_count, trial_ends_at, past_due_since, updated_at, apple_grace_period_expires_at",
      )
      .eq("provider_id", providerId)
      .maybeSingle();

    if (!subscription) {
      return notFoundResponse("No subscription found");
    }

    const row = subscription as {
      billing_provider?: string | null;
      paystack_subscription_code?: string | null;
      stripe_customer_id?: string | null;
    };

    const pendingCharge = pendingSavedCardChargeRefusal(row);
    if (pendingCharge) {
      return errorResponse(pendingCharge, "SUBSCRIPTION_CHARGE_PENDING", 409);
    }

    const billingProvider = String(row.billing_provider ?? "").toLowerCase();

    if (billingProvider === "flutterwave") {
      return errorResponse(
        "This subscription is billed with Flutterwave. Use checkout to pay or update the card.",
        "FLUTTERWAVE_MANAGE_UNSUPPORTED",
        400,
      );
    }

    if (billingProvider === "stripe") {
      const stripeCustomerId = row.stripe_customer_id?.trim();
      if (!stripeCustomerId) {
        return errorResponse(
          "We don't have a Stripe billing profile for this subscription yet. Complete checkout first, or contact support.",
          "NO_STRIPE_CUSTOMER",
          400,
        );
      }
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com").replace(
        /\/$/,
        "",
      );
      const link = await createProviderStripeBillingPortalUrl({
        tenantId,
        stripeCustomerId,
        returnUrl: `${appUrl}/provider/subscription`,
      });
      return successResponse({ link, provider: "stripe" as const });
    }

    const subCode = row.paystack_subscription_code?.trim();
    if (!subCode) {
      return errorResponse(
        "This subscription is not managed via Paystack recurring billing. Use checkout to pay or contact support.",
        "NO_PAYSTACK_SUBSCRIPTION",
        400,
      );
    }

    const res = await getSubscriptionManageLink(subCode, { tenantId });

    if (!res.status || !res.data?.link) {
      throw new Error(res.message || "Failed to generate manage link");
    }

    return successResponse({ link: res.data.link, provider: "paystack" as const });
  } catch (error) {
    return handleApiError(error, "Failed to get subscription management link");
  }
}
