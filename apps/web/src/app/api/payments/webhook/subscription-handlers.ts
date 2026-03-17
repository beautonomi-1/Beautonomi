/**
 * Paystack Subscription Webhook Handlers
 * 
 * Handles subscription-related webhook events from Paystack:
 * - subscription.create: New subscription created
 * - subscription.disable: Subscription disabled/cancelled
 * - subscription.enable: Subscription re-enabled
 * - invoice.create: New invoice for subscription renewal
 * - invoice.payment_failed: Subscription payment failed
 */

import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Handle subscription.create event
 */
export async function handleSubscriptionCreate(payload: Record<string, unknown>, supabase: SupabaseClient) {
  const subscriptionCode = payload.subscription_code as string | undefined;
  const customer = payload.customer as Record<string, unknown> | undefined;
  const plan = payload.plan as Record<string, unknown> | undefined;
  const customerCode = (customer?.customer_code ?? payload.customer_code) as string | undefined;
  const planCode = (plan?.plan_code ?? payload.plan_code) as string | undefined;
  const status = payload.status;
  const nextPaymentDate = payload.next_payment_date;

  if (!subscriptionCode) {
    console.error("Missing subscription_code in subscription.create event");
    return;
  }

  // Find provider by customer code or email
  const customerEmail = (payload.customer as Record<string, unknown> | undefined)?.email as string | undefined;
  const { data: customerRow } = await supabase
    .from("users")
    .select("id, email")
    .eq("email", customerEmail ?? "")
    .single();

  if (!customerRow) {
    console.error("Customer not found for subscription:", customerCode);
    return;
  }

  // Find provider
  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", customerRow.id)
    .single();

  if (!provider) {
    console.error("Provider not found for user:", customerRow.id);
    return;
  }

  // Find plan by Paystack plan code
  const { data: planRow } = await supabase
    .from("subscription_plans")
    .select("id")
    .or(`paystack_plan_code_monthly.eq.${planCode},paystack_plan_code_yearly.eq.${planCode}`)
    .single();

  if (!planRow) {
    console.error("Plan not found for Paystack plan code:", planCode);
    return;
  }

  // Determine billing period from plan
  const { data: planDetails } = await supabase
    .from("subscription_plans")
    .select("paystack_plan_code_monthly, paystack_plan_code_yearly")
    .eq("id", planRow.id)
    .single();

  type PlanDetailsRow = { paystack_plan_code_monthly?: string; paystack_plan_code_yearly?: string };
  const billingPeriod =
    (planDetails as PlanDetailsRow | null)?.paystack_plan_code_monthly === planCode ? "monthly" : "yearly";

  const auth = payload.authorization as Record<string, unknown> | undefined;
  const authCode = auth?.authorization_code as string | undefined;
  const createdAt = payload.createdAt as string | number | Date | undefined;
  await supabase.from("provider_subscriptions").upsert({
    provider_id: provider.id,
    plan_id: planRow.id,
    status: status === "active" ? "active" : "inactive",
    paystack_subscription_code: subscriptionCode,
    paystack_customer_code: customerCode,
    paystack_authorization_code: authCode,
    billing_period: billingPeriod,
    auto_renew: true,
    next_payment_date: nextPaymentDate ? new Date(nextPaymentDate as string | number | Date).toISOString() : null,
    started_at: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider_id" });
}

/**
 * Handle subscription.disable event
 */
export async function handleSubscriptionDisable(payload: Record<string, unknown>, supabase: SupabaseClient) {
  const subscriptionCode = payload.subscription_code as string | undefined;

  if (!subscriptionCode) {
    console.error("Missing subscription_code in subscription.disable event");
    return;
  }

  await supabase.from("provider_subscriptions")
    .update({
      status: "cancelled",
      auto_renew: false,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("paystack_subscription_code", subscriptionCode);
}

/**
 * Handle subscription.enable event
 */
export async function handleSubscriptionEnable(payload: Record<string, unknown>, supabase: SupabaseClient) {
  const subscriptionCode = payload.subscription_code;
  const nextPaymentDate = payload.next_payment_date;

  if (!subscriptionCode) {
    console.error("Missing subscription_code in subscription.enable event");
    return;
  }

  await supabase.from("provider_subscriptions")
    .update({
      status: "active",
      auto_renew: true,
      next_payment_date: nextPaymentDate ? new Date(nextPaymentDate as string).toISOString() : null,
      cancelled_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("paystack_subscription_code", subscriptionCode as string);
}

/**
 * Handle subscription invoice events (renewals)
 */
export async function handleSubscriptionInvoice(
  payload: Record<string, unknown>,
  eventType: string,
  supabase: SupabaseClient
) {
  const subPayload = payload.subscription as Record<string, unknown> | undefined;
  const subscriptionCode = (subPayload?.subscription_code ?? payload.subscription_code) as string | undefined;
  const invoiceCode = (payload.invoice_code ?? payload.code) as string | undefined;
  const amount = Number(payload.amount ?? 0);
  const fees = Number(payload.fees ?? 0);
  const status = payload.status;
  const paidAt = payload.paid_at;

  if (!subscriptionCode) {
    console.error("Missing subscription_code in invoice event");
    return;
  }

  // Get subscription
  const { data: subscription } = await supabase
    .from("provider_subscriptions")
    .select("provider_id, plan_id")
    .eq("paystack_subscription_code", subscriptionCode)
    .single();

  if (!subscription) {
    console.error("Subscription not found:", subscriptionCode);
    return;
  }

  type SubRow = { provider_id?: string; plan_id?: string };
  const sub = subscription as SubRow;
  const providerId = sub.provider_id;
  const _planId = sub.plan_id;

  if (eventType === "invoice.create") {
    const dueDate = payload.due_date as string | number | Date | undefined;
    await supabase.from("provider_subscriptions")
      .update({
        next_payment_date: dueDate ? new Date(dueDate).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("paystack_subscription_code", subscriptionCode);
  } else if (eventType === "invoice.payment_failed") {
    await supabase.from("provider_subscriptions")
      .update({
        status: "past_due",
        updated_at: new Date().toISOString(),
      })
      .eq("paystack_subscription_code", subscriptionCode);

    await supabase.from("payment_transactions").insert({
      booking_id: null,
      reference: invoiceCode,
      amount: convertFromSmallestUnit(amount),
      fees: convertFromSmallestUnit(fees),
      net_amount: convertFromSmallestUnit(amount - fees as number),
      status: "failed",
      provider: "paystack",
      transaction_type: "provider_subscription_payment",
      metadata: {
        subscription_code: subscriptionCode,
        invoice_code: invoiceCode,
        kind: "subscription_renewal",
      },
      created_at: new Date().toISOString(),
    });
  } else if (status === "success" && paidAt) {
    // Successful payment (renewal)
    const amountInCurrency = convertFromSmallestUnit(amount);
    const feesInCurrency = convertFromSmallestUnit(fees);
    const netAmount = amountInCurrency - feesInCurrency;

    // Get subscription details for notification
    const { data: subscriptionDetails } = await supabase
      .from("provider_subscriptions")
      .select("billing_period, plan_id, provider_id")
      .eq("paystack_subscription_code", subscriptionCode)
      .single();

    // Update subscription
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1); // Add 1 month for renewal

    const nextPaymentDate = (payload.next_payment_date ?? expiresAt) as string | number | Date | undefined;

    await supabase.from("provider_subscriptions")
      .update({
        status: "active",
        last_payment_date: new Date(paidAt as string | number | Date).toISOString(),
        expires_at: expiresAt.toISOString(),
        next_payment_date: nextPaymentDate ? new Date(nextPaymentDate).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("paystack_subscription_code", subscriptionCode);

    await supabase.from("payment_transactions").insert({
      booking_id: null,
      reference: invoiceCode,
      amount: amountInCurrency,
      fees: feesInCurrency,
      net_amount: netAmount,
      status: "success",
      provider: "paystack",
      transaction_type: "provider_subscription_payment",
      metadata: {
        subscription_code: subscriptionCode,
        invoice_code: invoiceCode,
        kind: "subscription_renewal",
      },
      created_at: new Date().toISOString(),
    });

    await supabase.from("finance_transactions").insert({
      booking_id: null,
      provider_id: providerId,
      transaction_type: "provider_subscription_payment",
      amount: netAmount,
      fees: feesInCurrency,
      commission: 0,
      net: netAmount,
      description: `Provider subscription renewal payment`,
      created_at: new Date().toISOString(),
    });

    // Send subscription_renewed notification
    if (subscriptionDetails) {
      try {
        const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
        const subDetails = subscriptionDetails as any;
        const billingPeriod = subDetails.billing_period || "monthly";

        // Get plan details
        const { data: plan } = await supabase
          .from("subscription_plans")
          .select("name, currency, price_monthly, price_yearly")
          .eq("id", subDetails.plan_id)
          .single();

        // Get provider details
        const { data: provider } = await supabase
          .from("providers")
          .select("user_id, business_name")
          .eq("id", subDetails.provider_id)
          .single();

        if (provider?.user_id && plan) {
          const planAmount = billingPeriod === "yearly" 
            ? (plan.price_yearly || netAmount)
            : (plan.price_monthly || netAmount);
          const currency = plan.currency || "ZAR";

          await sendTemplateNotification(
            "subscription_renewed",
            [provider.user_id],
            {
              business_name: provider.business_name || "Provider",
              plan_name: plan.name || "Current Plan",
              amount: `${currency} ${planAmount.toLocaleString()}`,
              billing_period: billingPeriod,
              next_payment_date: new Date(nextPaymentDate as string | Date).toLocaleDateString(),
              app_url: process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com",
              year: new Date().getFullYear().toString(),
            },
            ["push", "email", "sms"],
            { appType: "provider" }
          );
        }
      } catch (notifError) {
        console.error("Error sending subscription renewal notification:", notifError);
        // Don't fail webhook if notification fails
      }
    }
  }
}
