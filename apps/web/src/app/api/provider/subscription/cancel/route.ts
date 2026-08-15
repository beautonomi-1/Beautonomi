import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError, errorResponse } from '@/lib/supabase/api-helpers';
import { getAppleBillingPaystackBlock } from "@/lib/iap/apple/ios-eligibility";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";
import { createClient } from '@supabase/supabase-js';
import { disableSubscriptionByCode } from '@/lib/payments/paystack-complete';
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { providerTenantMismatchResponse } from "@/lib/tenant/provider-matches-host";
import { formatInTz, resolveTz } from "@/lib/dates/provider-tz";

/**
 * POST /api/provider/subscription/cancel
 * 
 * Cancel provider subscription
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const appleBilling = await getAppleBillingPaystackBlock(supabase, providerId);
    if (appleBilling.blocked) {
      return errorResponse(appleBilling.message, "APPLE_BILLING_ACTIVE", 409);
    }

    const marketMismatch = await providerTenantMismatchResponse(supabase, tenantId, providerId);
    if (marketMismatch) return marketMismatch;

    // Get subscription with plan details before cancelling
    const { data: subscriptionToCancel } = await supabase
      .from('provider_subscriptions')
      .select(`
        id,
        plan_id,
        expires_at,
        paystack_subscription_code,
        subscription_plans:plan_id(name)
      `)
      .eq('provider_id', providerId)
      .eq('status', 'active')
      .single();

    if (!subscriptionToCancel) {
      return handleApiError(new Error('No active subscription found'), 'No active subscription found');
    }

    // Cancel Paystack subscription if it exists (fetch email_token then disable)
    const paystackSubscriptionCode = (subscriptionToCancel as any).paystack_subscription_code;
    if (paystackSubscriptionCode) {
      try {
        await disableSubscriptionByCode(paystackSubscriptionCode, { tenantId });
      } catch (paystackError) {
        console.error("Error disabling Paystack subscription:", paystackError);
        // Continue with local cancellation even if Paystack call fails
      }
    }

    // Keep status 'active' until expires_at so provider retains access until period end.
    // Set cancelled_at + auto_renew=false to indicate pending cancellation.
    // A cron or webhook should set status='cancelled' once expires_at passes.
    const { data: subscription, error } = await supabase
      .from('provider_subscriptions')
      .update({
        cancelled_at: new Date().toISOString(),
        auto_renew: false,
        updated_at: new Date().toISOString(),
      })
      .eq('provider_id', providerId)
      .eq('status', 'active')
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Get provider details for notification
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: providerData } = await supabaseAdmin
      .from("providers")
      .select("id, business_name, user_id, timezone")
      .eq("id", providerId)
      .single();

    const tz = resolveTz((providerData as { timezone?: string | null } | null)?.timezone);

    // Send cancellation notification
    if (providerData?.user_id) {
      try {
        const expiresAtRaw = (subscriptionToCancel as any).expires_at;
        const expiresAt = expiresAtRaw
          ? formatInTz(new Date(expiresAtRaw), "MMM d, yyyy", tz)
          : "End of billing period";
        const planName = (subscriptionToCancel as any).subscription_plans?.name || "Current Plan";

        await sendTemplateNotification(
          "subscription_cancelled",
          [providerData.user_id],
          {
            business_name: providerData.business_name || "Provider",
            plan_name: planName,
            expires_at: expiresAt,
            app_url: process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com",
            year: formatInTz(new Date(), "yyyy", tz),
          },
          ["push", "email", "sms"],
          { appType: "provider" }
        );
      } catch (notifError) {
        console.error("Error sending cancellation notification:", notifError);
        // Don't fail the request if notification fails
      }
    }

    return successResponse(subscription || { success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to cancel subscription');
  }
}
