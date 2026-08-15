import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { processAppleSignedTransaction } from "@/lib/iap/apple/entitlement-bridge";
import { resolveIosPurchaseEligibility } from "@/lib/iap/apple/ios-eligibility";

const bodySchema = z.object({
  signed_transaction: z.string().min(10),
  /** Optional pending ads order id passed as appAccountToken for consumables. */
  app_account_token: z.string().uuid().optional(),
});

/**
 * POST /api/provider/iap/verify
 * Verify a StoreKit signed transaction and apply entitlements.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse("Invalid request body", "VALIDATION_ERROR", 400, parsed.error.flatten());
    }

    const { loadAppleProductById } = await import("@/lib/iap/apple/registry");
    const { loadAppleIapConfig, appleIapEnabledFromEnv } = await import(
      "@/lib/iap/apple/config"
    );
    const { verifyAndParseAppleTransactionJws } = await import("@/lib/iap/apple/jws");
    if (!appleIapEnabledFromEnv()) {
      return errorResponse("Apple in-app purchases are not enabled", "IAP_DISABLED", 503);
    }

    const appleConfig = await loadAppleIapConfig(supabase);
    let txPreview;
    try {
      txPreview = verifyAndParseAppleTransactionJws(parsed.data.signed_transaction, {
        expectedBundleId: appleConfig?.bundleId,
      });
    } catch (verifyError) {
      return errorResponse(
        verifyError instanceof Error ? verifyError.message : "Invalid App Store receipt",
        "IAP_SIGNATURE_INVALID",
        400,
      );
    }

    const product = await loadAppleProductById(supabase, txPreview.productId);
    const isSubscriptionProduct = product?.kind === "subscription";

    // Billing belongs to the owner; staff may only complete an ads pack purchase.
    if (isSubscriptionProduct && user.role === "provider_staff") {
      return errorResponse(
        "Only the business owner can change the subscription plan",
        "FORBIDDEN",
        403,
      );
    }

    const eligibility = await resolveIosPurchaseEligibility(supabase, providerId);
    // Paystack-grandfathering applies to subscription switches only — ads consumables stay allowed on iOS.
    if (
      isSubscriptionProduct &&
      !eligibility.eligible &&
      eligibility.billing_provider === "paystack"
    ) {
      return errorResponse(
        eligibility.reason ?? "In-app purchase not available for this account",
        "IAP_NOT_ELIGIBLE",
        403,
      );
    }

    const result = await processAppleSignedTransaction({
      supabase,
      signedTransaction: parsed.data.signed_transaction,
      providerIdHint: providerId,
    });

    if (!result.ok) {
      return errorResponse(
        result.error ?? "Unable to verify Apple transaction",
        "IAP_VERIFY_FAILED",
        422,
        { transaction_id: result.transactionId, product_id: result.productId },
      );
    }

    const { data: subscription } = await supabase
      .from("provider_subscriptions")
      .select(
        "*, plan:subscription_plans(id, name, description, price_monthly, price_yearly, currency, features, is_free)",
      )
      .eq("provider_id", providerId)
      .maybeSingle();

    return successResponse({
      transaction_id: result.transactionId,
      product_id: result.productId,
      kind: result.kind,
      subscription,
      ios_purchase_eligible: eligibility,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
