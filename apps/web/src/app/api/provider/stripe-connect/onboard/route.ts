/**
 * POST /api/provider/stripe-connect/onboard
 * Create Stripe Connect Express onboarding link for Stripe regions.
 */
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, errorResponse, getProviderIdForUser } from "@/lib/supabase/api-helpers";
import { getStripeClient } from "@/lib/payments/stripe-server";
import { getPaymentProviderForTenant } from "@/lib/payments/provider/registry";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner"], request);
    const supabaseUser = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabaseUser, { request });
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    const supabase = getSupabaseAdmin();
    const { data: provider } = await supabase
      .from("providers")
      .select("id, tenant_id, stripe_connect_account_id, business_name")
      .eq("id", providerId)
      .single();

    if (!provider?.tenant_id) {
      return errorResponse("Provider tenant missing", "CONFIG_ERROR", 500);
    }

    const psp = await getPaymentProviderForTenant(provider.tenant_id);
    if (psp?.provider.id !== "stripe") {
      return errorResponse("Stripe Connect is not enabled for this region", "NOT_STRIPE_REGION", 400);
    }

    const stripe = await getStripeClient(provider.tenant_id);
    let accountId = (provider as { stripe_connect_account_id?: string | null }).stripe_connect_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: (provider as { business_name?: string }).business_name ?? undefined,
        },
        metadata: { provider_id: providerId },
      });
      accountId = account.id;
      await supabase
        .from("providers")
        .update({ stripe_connect_account_id: accountId })
        .eq("id", providerId);
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/provider/settings/payout-accounts?refresh=1`,
      return_url: `${appUrl}/provider/settings/payout-accounts?connected=1`,
      type: "account_onboarding",
    });

    return successResponse({ url: link.url, account_id: accountId });
  } catch (error) {
    return handleApiError(error, "Failed to start Stripe Connect onboarding");
  }
}
