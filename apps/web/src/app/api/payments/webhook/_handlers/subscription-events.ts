/**
 * Subscription Event Handlers
 *
 * Handles subscription-related webhook events from Paystack:
 *   - subscription.create   — New subscription created
 *   - subscription.disable  — Subscription disabled / cancelled
 *   - subscription.enable   — Subscription re-enabled
 *   - subscription.not_renew — Subscription flagged as non-renewing
 *   - invoice.create        — New invoice for subscription renewal
 *   - invoice.payment_failed — Subscription payment failed
 */
import { NextResponse } from "next/server";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import type { PaystackEvent, SupabaseClient } from "./shared";

// ─── Exported Handler ────────────────────────────────────────────────────────

/**
 * Route a subscription / invoice event to the correct internal handler.
 */
export async function handleSubscriptionEvent(
  event: PaystackEvent,
  supabase: SupabaseClient,
): Promise<NextResponse> {
  const { event: eventType, data } = event;

  if (eventType === "subscription.create") {
    await handleSubscriptionCreate(data, supabase);
  } else if (eventType === "subscription.disable") {
    await handleSubscriptionDisable(data, supabase);
  } else if (eventType === "subscription.enable") {
    await handleSubscriptionEnable(data, supabase);
  } else if (eventType === "subscription.not_renew") {
    await handleSubscriptionNotRenew(data, supabase);
  } else if (eventType === "invoice.create" || eventType === "invoice.payment_failed") {
    await handleSubscriptionInvoice(data, eventType, supabase);
  } else {
    console.log(`Unhandled subscription event type: ${eventType}`);
  }

  return NextResponse.json({ received: true });
}

// ─── Internal Handlers ───────────────────────────────────────────────────────

async function handleSubscriptionCreate(payload: any, supabase: SupabaseClient) {
  const subscriptionCode = payload.subscription_code;
  const customerCode = payload.customer?.customer_code || payload.customer_code;
  const planCode = payload.plan?.plan_code || payload.plan_code;
  const status = payload.status;
  const nextPaymentDate = payload.next_payment_date;

  if (!subscriptionCode) {
    console.error("Missing subscription_code in subscription.create event");
    return;
  }

  // Find provider by customer code or email
  const { data: customer } = await supabase
    .from("users")
    .select("id, email")
    .eq("email", payload.customer?.email || "")
    .single();

  if (!customer) {
    console.error("Customer not found for subscription:", customerCode);
    return;
  }

  const { data: provider } = await supabase
    .from("providers")
    .select("id")
    .eq("user_id", customer.id)
    .single();

  if (!provider) {
    console.error("Provider not found for user:", customer.id);
    return;
  }

  // Find plan by Paystack plan code
  const { data: plan } = await supabase
    .from("subscription_plans")
    .select("id")
    .or(`paystack_plan_code_monthly.eq.${planCode},paystack_plan_code_yearly.eq.${planCode}`)
    .single();

  if (!plan) {
    console.error("Plan not found for Paystack plan code:", planCode);
    return;
  }

  // Determine billing period from plan
  const { data: planDetails } = await supabase
    .from("subscription_plans")
    .select("paystack_plan_code_monthly, paystack_plan_code_yearly")
    .eq("id", plan.id)
    .single();

  const billingPeriod =
    (planDetails as any)?.paystack_plan_code_monthly === planCode ? "monthly" : "yearly";

  // Update or create subscription
  await (supabase.from("provider_subscriptions") as any).upsert(
    {
      provider_id: provider.id,
      plan_id: plan.id,
      status: status === "active" ? "active" : "inactive",
      paystack_subscription_code: subscriptionCode,
      paystack_customer_code: customerCode,
      paystack_authorization_code: payload.authorization?.authorization_code,
      billing_period: billingPeriod,
      auto_renew: true,
      next_payment_date: nextPaymentDate
        ? new Date(nextPaymentDate).toISOString()
        : null,
      started_at: payload.createdAt
        ? new Date(payload.createdAt).toISOString()
        : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_id" },
  );
}

async function handleSubscriptionDisable(payload: any, supabase: SupabaseClient) {
  const subscriptionCode = payload.subscription_code;

  if (!subscriptionCode) {
    console.error("Missing subscription_code in subscription.disable event");
    return;
  }

  await (supabase.from("provider_subscriptions") as any)
    .update({
      status: "cancelled",
      auto_renew: false,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("paystack_subscription_code", subscriptionCode);
}

async function handleSubscriptionEnable(payload: any, supabase: SupabaseClient) {
  const subscriptionCode = payload.subscription_code;
  const nextPaymentDate = payload.next_payment_date;

  if (!subscriptionCode) {
    console.error("Missing subscription_code in subscription.enable event");
    return;
  }

  await (supabase.from("provider_subscriptions") as any)
    .update({
      status: "active",
      auto_renew: true,
      next_payment_date: nextPaymentDate
        ? new Date(nextPaymentDate).toISOString()
        : null,
      cancelled_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("paystack_subscription_code", subscriptionCode);
}

async function handleSubscriptionNotRenew(payload: any, supabase: SupabaseClient) {
  const subscriptionCode = payload.subscription_code;

  if (!subscriptionCode) {
    console.error("Missing subscription_code in subscription.not_renew event");
    return;
  }

  await (supabase.from("provider_subscriptions") as any)
    .update({
      auto_renew: false,
      updated_at: new Date().toISOString(),
    })
    .eq("paystack_subscription_code", subscriptionCode);

  console.log(`Subscription ${subscriptionCode} marked as non-renewing`);
}

async function handleSubscriptionInvoice(
  payload: any,
  eventType: string,
  supabase: SupabaseClient,
) {
  const subscriptionCode =
    payload.subscription?.subscription_code || payload.subscription_code;
  const invoiceCode = payload.invoice_code || payload.code;
  const amount = payload.amount || 0;
  const fees = payload.fees || 0;
  const status = payload.status;
  const paidAt = payload.paid_at;

  if (!subscriptionCode) {
    console.error("Missing subscription_code in invoice event");
    return;
  }

  const { data: subscription } = await supabase
    .from("provider_subscriptions")
    .select("provider_id, plan_id")
    .eq("paystack_subscription_code", subscriptionCode)
    .single();

  if (!subscription) {
    console.error("Subscription not found:", subscriptionCode);
    return;
  }

  const providerId = (subscription as any).provider_id;

  if (eventType === "invoice.create") {
    const dueDate = payload.due_date;
    await (supabase.from("provider_subscriptions") as any)
      .update({
        next_payment_date: dueDate ? new Date(dueDate).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("paystack_subscription_code", subscriptionCode);
  } else if (eventType === "invoice.payment_failed") {
    await (supabase.from("provider_subscriptions") as any)
      .update({
        status: "past_due",
        updated_at: new Date().toISOString(),
      })
      .eq("paystack_subscription_code", subscriptionCode);

    await (supabase.from("payment_transactions") as any).insert({
      booking_id: null,
      reference: invoiceCode,
      amount: convertFromSmallestUnit(amount),
      fees: convertFromSmallestUnit(fees),
      net_amount: convertFromSmallestUnit(amount - fees),
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
    // Successful renewal
    const amountInCurrency = convertFromSmallestUnit(amount);
    const feesInCurrency = convertFromSmallestUnit(fees);
    const netAmount = amountInCurrency - feesInCurrency;

    const { data: subscriptionDetails } = await supabase
      .from("provider_subscriptions")
      .select("billing_period, plan_id, provider_id")
      .eq("paystack_subscription_code", subscriptionCode)
      .single();

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const nextPaymentDate = payload.next_payment_date || expiresAt;

    await (supabase.from("provider_subscriptions") as any)
      .update({
        status: "active",
        last_payment_date: new Date(paidAt).toISOString(),
        expires_at: expiresAt.toISOString(),
        next_payment_date: nextPaymentDate
          ? new Date(nextPaymentDate as string | Date).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("paystack_subscription_code", subscriptionCode);

    await (supabase.from("payment_transactions") as any).insert({
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

    await (supabase.from("finance_transactions") as any).insert({
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

        const { data: plan } = await supabase
          .from("subscription_plans")
          .select("name, currency, price_monthly, price_yearly")
          .eq("id", subDetails.plan_id)
          .single();

        const { data: provider } = await supabase
          .from("providers")
          .select("user_id, business_name")
          .eq("id", subDetails.provider_id)
          .single();

        if (provider?.user_id && plan) {
          const planAmount =
            billingPeriod === "yearly"
              ? plan.price_yearly || netAmount
              : plan.price_monthly || netAmount;
          const currency = plan.currency || "ZAR";

          await sendTemplateNotification(
            "subscription_renewed",
            [provider.user_id],
            {
              business_name: provider.business_name || "Provider",
              plan_name: plan.name || "Current Plan",
              amount: `${currency} ${planAmount.toLocaleString()}`,
              billing_period: billingPeriod,
              next_payment_date: new Date(
                nextPaymentDate as string | Date,
              ).toLocaleDateString(),
              app_url: process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com",
              year: new Date().getFullYear().toString(),
            },
            ["push", "email", "sms"],
          );
        }
      } catch (notifError) {
        console.error("Error sending subscription renewal notification:", notifError);
      }
    }
  }
}
