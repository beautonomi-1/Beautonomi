import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from '@/lib/supabase/api-helpers';
import { sendTemplateNotification } from "@/lib/notifications/onesignal";
import { createClient } from '@supabase/supabase-js';
import { disableSubscription } from '@/lib/payments/paystack-complete';
import { getPaystackSecretKey } from '@/lib/payments/paystack-server';

/**
 * POST /api/provider/subscription/cancel
 * 
 * Cancel provider subscription
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

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

    // Cancel Paystack subscription if it exists
    const paystackSubscriptionCode = (subscriptionToCancel as any).paystack_subscription_code;
    if (paystackSubscriptionCode) {
      try {
        const secretKey = await getPaystackSecretKey();
        await disableSubscription(paystackSubscriptionCode, secretKey);
      } catch (paystackError) {
        console.error("Error disabling Paystack subscription:", paystackError);
        // Continue with cancellation even if Paystack call fails
      }
    }

    const { data: subscription, error } = await supabase
      .from('provider_subscriptions')
      .update({
        status: 'cancelled',
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
      .select("id, business_name, user_id")
      .eq("id", providerId)
      .single();

    // Send cancellation notification
    if (providerData?.user_id) {
      try {
        const expiresAt = (subscriptionToCancel as any).expires_at 
          ? new Date((subscriptionToCancel as any).expires_at).toLocaleDateString()
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
            year: new Date().getFullYear().toString(),
          },
          ["push", "email", "sms"]
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
