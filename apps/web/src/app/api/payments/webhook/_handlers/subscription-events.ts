/**
 * Subscription Event Handlers
 *
 * Handles subscription-related webhook events from Paystack:
 *   - subscription.create       — New subscription created
 *   - subscription.disable     — Subscription disabled / cancelled
 *   - subscription.enable      — Subscription re-enabled
 *   - subscription.not_renew   — Subscription flagged as non-renewing
 *   - subscription.expiring_cards — Cards expiring this month (notify)
 *   - invoice.create           — New invoice for subscription renewal
 *   - invoice.update            — Invoice status updated after charge attempt
 *   - invoice.payment_failed    — Subscription payment failed
 *
 * Recurring renewal failures that surface as charge.failed (card decline) are handled in
 * charge-success.ts (handleChargeFailed → subscription renewal branch), not here, to avoid
 * double-processing with invoice.* events.
 */
import { NextResponse } from "next/server";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import type { PaystackEvent, SupabaseClient } from "./shared";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { recordProviderSubscriptionPayment } from "@/lib/subscriptions/provider-subscription-payment";

/** Map Paystack subscription status to provider_subscriptions status (active | cancelled | expired | past_due). */
function mapPaystackStatusToDb(status: string): "active" | "past_due" {
  if (status === "attention") return "past_due";
  return "active";
}

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
  } else if (eventType === "subscription.expiring_cards") {
    await handleSubscriptionExpiringCards(data, supabase);
  } else if (
    eventType === "invoice.create" ||
    eventType === "invoice.update" ||
    eventType === "invoice.payment_failed"
  ) {
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

  // Resolve the provider. Primary path: match the Paystack customer email to a
  // user, then that user's provider. Fallback: when the email does not match (a
  // common cause of "subscription created but never linked" bugs), look the
  // provider up directly by the Paystack customer code already stored on a row.
  let provider: { id: string; tenant_id?: string | null } | null = null;

  const { data: customer } = await supabase
    .from("users")
    .select("id, email")
    .eq("email", payload.customer?.email || "")
    .maybeSingle();

  if (customer) {
    const { data: providerByUser } = await supabase
      .from("providers")
      .select("id, tenant_id")
      .eq("user_id", (customer as { id: string }).id)
      .maybeSingle();
    provider = (providerByUser as typeof provider) ?? null;
  }

  if (!provider && customerCode) {
    const { data: subByCustomer } = await supabase
      .from("provider_subscriptions")
      .select("provider_id, providers:provider_id(id, tenant_id)")
      .eq("paystack_customer_code", customerCode)
      .maybeSingle();
    const rawJoined = (subByCustomer as unknown as
      | { providers?: { id: string; tenant_id?: string | null } | { id: string; tenant_id?: string | null }[] | null }
      | null)?.providers;
    const joined = Array.isArray(rawJoined) ? rawJoined[0] : rawJoined;
    if (joined?.id) provider = joined;
  }

  if (!provider) {
    console.error("Provider not found for subscription (email + customer_code fallback failed):", customerCode);
    return;
  }

  const subscriptionTenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: (provider as { tenant_id?: string | null }).tenant_id,
    provider_id: (provider as { id: string }).id,
  });

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

  type PlanDetailsRow = { paystack_plan_code_monthly?: string | null; paystack_plan_code_yearly?: string | null };
  const billingPeriod =
    (planDetails as PlanDetailsRow)?.paystack_plan_code_monthly === planCode ? "monthly" : "yearly";

  const dbStatus = mapPaystackStatusToDb(status || "active");

  await supabase.from("provider_subscriptions").upsert(
    {
      provider_id: provider.id,
      tenant_id: subscriptionTenantId,
      plan_id: plan.id,
      status: dbStatus,
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

  const { data: row } = await supabase
    .from("provider_subscriptions")
    .select("id, status, cancelled_at, expires_at")
    .eq("paystack_subscription_code", subscriptionCode)
    .maybeSingle();

  if (!row) {
    console.warn("subscription.disable: no local subscription row for", subscriptionCode);
    return;
  }

  const now = new Date();
  const expiresAt = row.expires_at ? new Date(row.expires_at as string) : null;
  const cancelledAt = row.cancelled_at ? new Date(row.cancelled_at as string) : null;
  const retainAccessUntilPeriodEnd =
    (row as { status?: string }).status === "active" &&
    cancelledAt != null &&
    !Number.isNaN(cancelledAt.getTime()) &&
    expiresAt != null &&
    !Number.isNaN(expiresAt.getTime()) &&
    expiresAt > now;

  // Cancel-at-period-end: `/api/provider/subscription/cancel` sets `cancelled_at` while keeping status
  // `active` until `expires_at`. Paystack `subscription.disable` can still fire once renewals stop;
  // do not flip status to `cancelled` early or the provider loses premium access before period end.
  if (retainAccessUntilPeriodEnd) {
    await supabase
      .from("provider_subscriptions")
      .update({
        auto_renew: false,
        updated_at: now.toISOString(),
      })
      .eq("paystack_subscription_code", subscriptionCode);
    console.log(
      `[subscription] Paystack disabled renewals for ${subscriptionCode}; local row kept active until ${expiresAt.toISOString()}`,
    );
    return;
  }

  await supabase.from("provider_subscriptions").update({
    status: "cancelled",
    auto_renew: false,
    cancelled_at: (row as { cancelled_at?: string | null }).cancelled_at ?? now.toISOString(),
    updated_at: now.toISOString(),
  }).eq("paystack_subscription_code", subscriptionCode);
}

async function handleSubscriptionEnable(payload: any, supabase: SupabaseClient) {
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

  await supabase.from("provider_subscriptions")
    .update({
      auto_renew: false,
      updated_at: new Date().toISOString(),
    })
    .eq("paystack_subscription_code", subscriptionCode);

  console.log(`Subscription ${subscriptionCode} marked as non-renewing`);
}

/**
 * Paystack sends `invoice.update` after each renewal charge attempt with final invoice status.
 * Successful renewals extend `expires_at`, record payment + finance rows, and notify.
 * Exported for unit tests; production path is `handleSubscriptionEvent` → `invoice.update`.
 */
export async function recordSuccessfulProviderSubscriptionRenewalFromInvoice(
  supabase: SupabaseClient,
  args: {
    subscriptionCode: string;
    invoiceCode: string | undefined;
    amount: number;
    fees: number;
    paidAt: string | number | Date;
    payload: Record<string, unknown>;
    providerId: string;
  },
): Promise<void> {
  const { subscriptionCode, invoiceCode, amount, fees, paidAt, payload, providerId } = args;
  // Prefer the underlying Paystack transaction reference so a renewal that
  // surfaces as BOTH charge.success and invoice.update is recognized exactly
  // once (both events carry the same transaction reference). Fall back to the
  // invoice code, then a synthetic key, when the transaction ref is absent.
  const txnReference =
    (typeof (payload as { transaction?: { reference?: string } }).transaction?.reference === "string"
      ? (payload as { transaction: { reference: string } }).transaction.reference
      : null) ||
    (invoiceCode && String(invoiceCode)) ||
    `sub_renew:${subscriptionCode}:${String(paidAt)}`;

  const { data: existingTx } = await supabase
    .from("payment_transactions")
    .select("id, status")
    .eq("provider", "paystack")
    .eq("reference", txnReference)
    .maybeSingle();
  const existingStatus = String(
    (existingTx as { status?: string } | null)?.status ?? "",
  ).toLowerCase();
  // Failed-then-success: a prior invoice.payment_failed / charge.failed may have
  // inserted a failed row under the same reference (invoice code). Clear it so
  // recognition + activation can proceed; money posting is still idempotent.
  if (existingTx && existingStatus === "failed") {
    console.warn(
      `[subscription] upgrading failed renewal row to success for ref ${txnReference}`,
    );
    await supabase
      .from("payment_transactions")
      .delete()
      .eq("id", (existingTx as { id: string }).id);
  } else if (existingTx) {
    // success or unknown status — already recorded; do not double-post.
    console.log(`[subscription] renewal already recorded for ref ${txnReference}`);
    return;
  }

  const amountInCurrency = convertFromSmallestUnit(Number(amount || 0));
  const feesInCurrency = convertFromSmallestUnit(Number(fees || 0));
  const netAmount = amountInCurrency - feesInCurrency;

  const { data: subscriptionDetails } = await supabase
    .from("provider_subscriptions")
    .select("billing_period, plan_id, provider_id, tenant_id")
    .eq("paystack_subscription_code", subscriptionCode)
    .single();

  const now = new Date();
  type SubDetailsRow = {
    billing_period?: string | null;
    plan_id?: string;
    provider_id?: string;
    tenant_id?: string | null;
  };
  const billingPeriodForExpiry = (subscriptionDetails as SubDetailsRow | null)?.billing_period ?? "monthly";

  // Anchor access to the actual billing period end. Paystack's
  // `next_payment_date` is the authoritative period boundary; only when it is
  // absent do we fall back to computing now + one billing cycle.
  const rawNextPaymentDate = (payload as { next_payment_date?: string }).next_payment_date;
  const computedPeriodEnd = new Date(now);
  if (billingPeriodForExpiry === "yearly") {
    computedPeriodEnd.setFullYear(computedPeriodEnd.getFullYear() + 1);
  } else {
    computedPeriodEnd.setMonth(computedPeriodEnd.getMonth() + 1);
  }
  const expiresAt = rawNextPaymentDate ? new Date(rawNextPaymentDate) : computedPeriodEnd;
  const nextPaymentDate = rawNextPaymentDate || expiresAt;

  await supabase
    .from("provider_subscriptions")
    .update({
      status: "active",
      last_payment_date: new Date(paidAt).toISOString(),
      expires_at: expiresAt.toISOString(),
      next_payment_date: nextPaymentDate ? new Date(nextPaymentDate as string | Date).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("paystack_subscription_code", subscriptionCode);

  // Recognize the renewal payment through the unified idempotent helper so the
  // money is posted exactly once (charge.success / invoice.update overlap and
  // duplicate webhooks all dedupe on txnReference).
  await recordProviderSubscriptionPayment({
    supabase,
    reference: txnReference,
    providerId,
    amountMajor: amountInCurrency,
    feesMajor: feesInCurrency,
    planId: (subscriptionDetails as SubDetailsRow | null)?.plan_id ?? null,
    subscriptionCode,
    invoiceCode: invoiceCode ?? null,
    paymentTransactionType: "provider_subscription_payment",
    kind: "subscription_renewal",
    description: "Provider subscription renewal payment",
    tenantIdHint: (subscriptionDetails as SubDetailsRow | null)?.tenant_id ?? null,
  });

  if (subscriptionDetails) {
    try {
      const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
      const subDetails = subscriptionDetails as SubDetailsRow;
      const billingPeriod = subDetails.billing_period ?? "monthly";

      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("name, currency, price_monthly, price_yearly")
        .eq("id", subDetails.plan_id ?? "")
        .single();

      const { data: provider } = await supabase
        .from("providers")
        .select("user_id, business_name, tenant_id")
        .eq("id", subDetails.provider_id ?? "")
        .single();

      if (provider?.user_id && plan) {
        const planAmount =
          billingPeriod === "yearly" ? plan.price_yearly || netAmount : plan.price_monthly || netAmount;
        const provTenant = (provider as { tenant_id?: string | null }).tenant_id;
        const subTenant = subDetails.tenant_id ?? null;
        const tenantForCurrency = provTenant ?? subTenant;
        const lastResortCurrency = tenantForCurrency
          ? (await getTenantRegionConfig(tenantForCurrency))?.defaultCurrency ?? LAST_RESORT_CURRENCY
          : LAST_RESORT_CURRENCY;
        const currency = plan.currency || lastResortCurrency;

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
          { appType: "provider" },
        );
      }
    } catch (notifError) {
      console.error("Error sending subscription renewal notification:", notifError);
    }
  }
}

async function handleSubscriptionExpiringCards(payload: any, supabase: SupabaseClient) {
  const items = Array.isArray(payload) ? payload : [payload];
  for (const item of items) {
    const sub = item.subscription;
    const subscriptionCode = sub?.subscription_code;
    const customer = item.customer;
    const expiryDate = item.expiry_date;
    const description = item.description;
    if (!subscriptionCode) continue;

    const { data: row } = await supabase
      .from("provider_subscriptions")
      .select("provider_id, providers:provider_id(user_id)")
      .eq("paystack_subscription_code", subscriptionCode)
      .single();

    const provider = Array.isArray(row?.providers) ? row.providers[0] : row?.providers;
    const userId = provider && typeof provider === "object" && "user_id" in provider ? (provider as { user_id: string }).user_id : null;
    if (userId) {
      try {
        const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
        await sendTemplateNotification(
          "subscription_card_expiring",
          [userId],
          {
            expiry_date: expiryDate || "",
            description: description || "Card ending soon",
            customer_email: customer?.email || "",
            app_url: process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com",
            year: new Date().getFullYear().toString(),
          },
          ["push", "email"],
          { appType: "provider" }
        );
      } catch (e) {
        console.error("Error sending expiring card notification:", e);
      }
    }
    console.log(`Subscription ${subscriptionCode} card expiring: ${expiryDate}`, description);
  }
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

  type SubRow = { provider_id: string; plan_id?: string };
  const providerId = (subscription as SubRow).provider_id;

  if (eventType === "invoice.create") {
    const dueDate = payload.due_date || payload.period_end;
    await supabase.from("provider_subscriptions")
      .update({
        next_payment_date: dueDate ? new Date(dueDate).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("paystack_subscription_code", subscriptionCode);
  } else if (eventType === "invoice.update") {
    const dueDate = payload.due_date || payload.period_end || payload.next_payment_date;
    const invoiceStatus = payload.status;
    const paidAtVal = payload.paid_at;

    if (invoiceStatus === "success" && paidAtVal) {
      await recordSuccessfulProviderSubscriptionRenewalFromInvoice(supabase, {
        subscriptionCode,
        invoiceCode,
        amount,
        fees,
        paidAt: paidAtVal,
        payload,
        providerId,
      });
      return;
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (dueDate) updatePayload.next_payment_date = new Date(dueDate).toISOString();
    if (invoiceStatus === "failed" || invoiceStatus === "attention") {
      // Do not flip past_due when this invoice (or its charge) already succeeded —
      // Paystack can deliver a stale failed invoice.update after a successful renew.
      const txnRefForGuard =
        typeof (payload as { transaction?: { reference?: string } }).transaction?.reference ===
        "string"
          ? (payload as { transaction: { reference: string } }).transaction.reference
          : null;
      const refsToCheck = [txnRefForGuard, invoiceCode ? String(invoiceCode) : null].filter(
        Boolean,
      ) as string[];
      let alreadySucceeded = false;
      for (const ref of refsToCheck) {
        const { data: successTx } = await supabase
          .from("payment_transactions")
          .select("id")
          .eq("provider", "paystack")
          .eq("reference", ref)
          .eq("status", "success")
          .maybeSingle();
        if (successTx) {
          alreadySucceeded = true;
          break;
        }
      }
      if (alreadySucceeded) {
        console.log(
          `[subscription] skip past_due on invoice.update — renewal already succeeded for ${subscriptionCode}`,
        );
      } else {
        updatePayload.status = "past_due";
      }
    }
    await supabase.from("provider_subscriptions")
      .update(updatePayload)
      .eq("paystack_subscription_code", subscriptionCode);
  } else if (eventType === "invoice.payment_failed") {
    // Idempotency: a failed-renewal webhook can arrive more than once. Dedupe on
    // the failed payment_transactions reference so we don't pile up rows / notify
    // repeatedly. Fall back to a day-bucketed synthetic key when the invoice code
    // is absent so later cycles are not silently swallowed.
    const failedReference =
      (invoiceCode && String(invoiceCode)) ||
      `sub_renew_failed:${subscriptionCode}:${new Date().toISOString().slice(0, 10)}`;
    const txnRefForGuard =
      typeof (payload as { transaction?: { reference?: string } }).transaction?.reference ===
      "string"
        ? (payload as { transaction: { reference: string } }).transaction.reference
        : null;

    // Success-then-failed race: never downgrade after a recognized renewal.
    const successRefs = [txnRefForGuard, invoiceCode ? String(invoiceCode) : null].filter(
      Boolean,
    ) as string[];
    for (const ref of successRefs) {
      const { data: successTx } = await supabase
        .from("payment_transactions")
        .select("id")
        .eq("provider", "paystack")
        .eq("reference", ref)
        .eq("status", "success")
        .maybeSingle();
      if (successTx) {
        console.log(
          `[subscription] skip invoice.payment_failed — renewal already succeeded for ref ${ref}`,
        );
        return;
      }
    }

    const { data: existingFailedTx } = await supabase
      .from("payment_transactions")
      .select("id")
      .eq("provider", "paystack")
      .eq("reference", failedReference)
      .eq("status", "failed")
      .maybeSingle();

    if (existingFailedTx) {
      console.log(`[subscription] renewal failure already recorded for ref ${failedReference}`);
      return;
    }

    await supabase.from("provider_subscriptions")
      .update({
        status: "past_due",
        updated_at: new Date().toISOString(),
      })
      .eq("paystack_subscription_code", subscriptionCode)
      .in("status", ["active", "past_due"]);

    await supabase.from("payment_transactions").insert({
      booking_id: null,
      reference: failedReference,
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

    // Notify provider about payment failure
    try {
      const { data: subRow } = await supabase
        .from("provider_subscriptions")
        .select("provider_id, plan_id, subscription_plans:plan_id(name)")
        .eq("paystack_subscription_code", subscriptionCode)
        .maybeSingle();
      if (subRow) {
        const subData = subRow as { provider_id?: string; subscription_plans?: { name?: string } | null };
        const { data: provider } = await supabase
          .from("providers")
          .select("user_id, business_name")
          .eq("id", subData.provider_id)
          .maybeSingle();
        if (provider) {
          const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
          await sendTemplateNotification(
            "subscription_payment_failed",
            [(provider as { user_id: string }).user_id],
            {
              business_name: (provider as { business_name?: string }).business_name || "Provider",
              plan_name: subData.subscription_plans?.name || "subscription",
              amount: `${convertFromSmallestUnit(amount)}`,
              app_url: process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com",
            },
            ["push"],
            { appType: "provider" }
          );
        }
      }
    } catch (notifErr) {
      console.warn("Failed to send subscription payment failed notification:", notifErr);
    }
  }
}
