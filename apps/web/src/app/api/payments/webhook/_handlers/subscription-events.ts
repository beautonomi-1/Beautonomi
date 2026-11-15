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
import { subtractMoney } from "@beautonomi/utils";

import { NextResponse } from "next/server";
import { convertFromSmallestUnit } from "@/lib/payments/paystack";
import type { PaystackEvent, SupabaseClient } from "./shared";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import {
  recordProviderSubscriptionPayment,
  rememberReturnedProviderSubscriptionCharge,
  returnRecordedPaystackSubscriptionCharge,
} from "@/lib/subscriptions/provider-subscription-payment";
import {
  capturedRenewalAccess,
  capturedRenewalPeriodEnd,
  computePaidPeriodExpiresAt,
  renewalPeriodStartIso,
  subscriptionCreateAccessUpdate,
  subscriptionCreatePlanPatch,
  subscriptionDisableApplies,
  subscriptionEnableUpdate,
  nextChargeDateUpdate,
  subscriptionNotRenewUpdate,
  loadProviderSubscriptionByPaystackCode,
  loadProviderSubscriptionByProviderId,
  loadProviderSubscriptionForPaystackCustomer,
  paystackCustomerEmailPattern,
  paystackActivationFields,
  paystackChargeAlreadyReturned,
  renewalChargeAlreadySettled,
  returnPaystackChargeForOtherMerchant,
  shouldIgnorePaystackEventForRow,
  trackInboundPaystackSubscription,
} from "@/lib/subscriptions/provider-billing-merchant";
import { isPastDueWithinGrace, subscriptionPaymentFailedAccessNote } from "@/lib/iap/apple/billing-active";
import { SUBSCRIPTION_PAST_DUE_GRACE_DAYS } from "@/lib/subscriptions/feature-access";

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

  const customerEmail = paystackCustomerEmailPattern(String(payload.customer?.email || ""));
  const { data: customer } = customerEmail
    ? await supabase.from("users").select("id, email").ilike("email", customerEmail).maybeSingle()
    : { data: null };

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

  const merchantRow = await loadProviderSubscriptionByProviderId(supabase, provider.id);
  if (shouldIgnorePaystackEventForRow(merchantRow) && merchantRow) {
    await trackInboundPaystackSubscription({
      supabase,
      row: merchantRow,
      subscriptionCode,
      tenantId: subscriptionTenantId,
      providerId: provider.id,
    });
    return;
  }

  const { data: currentRow } = await supabase
    .from("provider_subscriptions")
    .select("expires_at, started_at, status")
    .eq("provider_id", provider.id)
    .maybeSingle();
  const current = currentRow as {
    expires_at?: string | null;
    started_at?: string | null;
    status?: string | null;
  } | null;
  const access = subscriptionCreateAccessUpdate({
    billingPeriod,
    nextPaymentDate,
    createdAt: payload.createdAt,
    currentExpiresAt: current?.expires_at,
    currentStartedAt: current?.started_at,
    currentStatus: current?.status,
    eventStatus: dbStatus,
  });
  const activation = paystackActivationFields();
  if (!access.updated_at) delete activation.updated_at;

  const { CLEAR_PENDING_UPGRADE_FIELDS } = await import(
    "@/lib/subscriptions/pending-upgrade-fields"
  );
  await supabase.from("provider_subscriptions").upsert(
    {
      provider_id: provider.id,
      tenant_id: subscriptionTenantId,
      paystack_subscription_code: subscriptionCode,
      paystack_customer_code: customerCode,
      ...subscriptionCreatePlanPatch({
        applyPlan: access.applyPlan,
        planId: plan.id,
        billingPeriod,
        nextPaymentDate: access.expires_at ?? nextPaymentDate,
        authorizationCode: payload.authorization?.authorization_code,
      }),
      ...(access.status ? { status: access.status } : {}),
      ...(access.past_due_since !== undefined ? { past_due_since: access.past_due_since } : {}),
      ...(access.expires_at
        ? { expires_at: access.expires_at, billing_period_end: access.expires_at }
        : {}),
      ...(access.started_at ? { started_at: access.started_at } : {}),
      ...activation,
      ...(access.clearPendingUpgrade ? CLEAR_PENDING_UPGRADE_FIELDS : {}),
    },
    { onConflict: "provider_id" },
  );
}

/**
 * Paid-to-paid downgrade: the old Paystack sub is disabled at schedule time and the cron creates
 * the cheaper sub at period end. Disable / not_renew events for the old code must not end access
 * or flip auto_renew (web would offer "Extend plan" on the old price).
 *
 * Not bounded by expires_at: Paystack sends subscription.disable when renewals stop, i.e. at period
 * end, which is after expires_at but before the daily cron runs. The cron resolves every scheduled
 * row (applies it, falls back to free, or retries), so the webhook never needs to.
 */
export function isScheduledDowngradePending(
  row: { scheduled_plan_id?: string | null } | null | undefined,
): boolean {
  return Boolean(row?.scheduled_plan_id);
}

async function handleSubscriptionDisable(payload: any, supabase: SupabaseClient) {
  const subscriptionCode = payload.subscription_code;

  if (!subscriptionCode) {
    console.error("Missing subscription_code in subscription.disable event");
    return;
  }

  const merchantRow = await loadProviderSubscriptionByPaystackCode(supabase, subscriptionCode);
  if (shouldIgnorePaystackEventForRow(merchantRow)) {
    console.log(
      `[subscription] subscription.disable ignored — ${merchantRow?.billing_provider ?? "apple"} is merchant for ${subscriptionCode}`,
    );
    return;
  }

  if (!merchantRow) {
    console.warn("subscription.disable: no local subscription row for", subscriptionCode);
    return;
  }

  const row = merchantRow as {
    id?: string;
    status?: string;
    cancelled_at?: string | null;
    expires_at?: string | null;
    scheduled_plan_id?: string | null;
  };

  const now = new Date();
  const expiresAt = row.expires_at ? new Date(row.expires_at as string) : null;
  if (isScheduledDowngradePending(row)) {
    console.log(
      `[subscription] Paystack disable ignored — scheduled downgrade pending for ${subscriptionCode}; cron applies it`,
    );
    return;
  }
  if (
    !subscriptionDisableApplies({
      nextPaymentDate: payload.next_payment_date,
      currentNextPaymentDate: (row as { next_payment_date?: string | null }).next_payment_date,
    })
  ) {
    console.log(
      `[subscription] Paystack disable ignored — a later charge date is already stored for ${subscriptionCode}`,
    );
    return;
  }
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
    past_due_since: null,
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

  const merchantRow = await loadProviderSubscriptionByPaystackCode(supabase, subscriptionCode);
  if (shouldIgnorePaystackEventForRow(merchantRow)) return;

  const { data: currentRow } = await supabase
    .from("provider_subscriptions")
    .select("status, next_payment_date")
    .eq("paystack_subscription_code", subscriptionCode)
    .maybeSingle();
  const current = currentRow as { status?: string | null; next_payment_date?: string | null } | null;
  const patch = subscriptionEnableUpdate({
    nextPaymentDate,
    currentNextPaymentDate: current?.next_payment_date,
    currentStatus: current?.status,
  });
  if (Object.keys(patch).length === 0) return;

  const activation = paystackActivationFields();
  if (!patch.updated_at) delete activation.updated_at;
  delete patch.updated_at;
  await supabase
    .from("provider_subscriptions")
    .update({
      ...patch,
      ...activation,
    })
    .eq("paystack_subscription_code", subscriptionCode);
}

async function handleSubscriptionNotRenew(payload: any, supabase: SupabaseClient) {
  const subscriptionCode = payload.subscription_code;

  if (!subscriptionCode) {
    console.error("Missing subscription_code in subscription.not_renew event");
    return;
  }

  const merchantRow = await loadProviderSubscriptionByPaystackCode(supabase, subscriptionCode);
  if (shouldIgnorePaystackEventForRow(merchantRow)) return;
  if (isScheduledDowngradePending(merchantRow)) {
    console.log(
      `[subscription] subscription.not_renew ignored — scheduled downgrade in progress for ${subscriptionCode}`,
    );
    return;
  }

  const notRenewUpdate = subscriptionNotRenewUpdate({
    nextPaymentDate: payload.next_payment_date,
    currentNextPaymentDate: (merchantRow as { next_payment_date?: string | null } | null)
      ?.next_payment_date,
    currentStatus: merchantRow?.status,
  });
  if (Object.keys(notRenewUpdate).length === 0) {
    console.log(
      `[subscription] subscription.not_renew ignored — a later charge date is already stored for ${subscriptionCode}`,
    );
    return;
  }
  await supabase.from("provider_subscriptions")
    .update(notRenewUpdate)
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

  const merchantRow = await loadProviderSubscriptionByPaystackCode(supabase, subscriptionCode);
  if (shouldIgnorePaystackEventForRow(merchantRow)) {
    const chargeRef =
      typeof (payload as { transaction?: { reference?: string } }).transaction?.reference === "string"
        ? (payload as { transaction: { reference: string } }).transaction.reference.trim()
        : "";
    if (chargeRef) {
      await returnPaystackChargeForOtherMerchant(supabase, {
        reference: chargeRef,
        tenantId: (merchantRow as { tenant_id?: string | null } | null)?.tenant_id ?? null,
        providerId,
        amountMajor: convertFromSmallestUnit(Number(amount || 0), String(payload.currency || "ZAR")),
        invoiceCode: invoiceCode ?? null,
      });
    }
    console.log(
      `[subscription] renewal invoice returned — ${merchantRow?.billing_provider} is merchant for ${subscriptionCode}`,
    );
    return;
  }

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
  }

  const paymentAlreadySaved = Boolean(existingTx) && existingStatus !== "failed";
  if (existingStatus === "refunded" || existingStatus === "partially_refunded") {
    console.log(`[subscription] renewal charge already returned for ref ${txnReference}`);
    return;
  }
  if (paymentAlreadySaved) {
    console.log(`[subscription] renewal already recorded for ref ${txnReference}`);
  }

  const payloadCurrency = String(payload.currency || "ZAR");
  const amountInCurrency = convertFromSmallestUnit(Number(amount || 0), payloadCurrency);
  const feesInCurrency = convertFromSmallestUnit(Number(fees || 0), payloadCurrency);
  const netAmount = subtractMoney(amountInCurrency, feesInCurrency);

  const { data: subscriptionDetails } = await supabase
    .from("provider_subscriptions")
    .select("billing_period, plan_id, provider_id, tenant_id, expires_at")
    .eq("paystack_subscription_code", subscriptionCode)
    .single();

  const now = new Date();
  type SubDetailsRow = {
    billing_period?: string | null;
    plan_id?: string;
    provider_id?: string;
    tenant_id?: string | null;
    expires_at?: string | null;
  };
  const details = subscriptionDetails as SubDetailsRow | null;
  const billingPeriodForExpiry = details?.billing_period === "yearly" ? "yearly" : "monthly";

  // Paystack's next_payment_date is the period boundary. Without it, the
  // charge time owns the period, and a replay does not move that end date.
  const rawNextPaymentDate = (payload as { next_payment_date?: string }).next_payment_date;
  const paidAtDate = new Date(paidAt);
  const chargedAt = Number.isFinite(paidAtDate.getTime()) ? paidAtDate : now;
  const computedPeriodEnd = computePaidPeriodExpiresAt(billingPeriodForExpiry, chargedAt);
  const owedPeriodEnd = rawNextPaymentDate
    ? null
    : capturedRenewalPeriodEnd(billingPeriodForExpiry, chargedAt.toISOString(), details?.expires_at);
  const openUntilMs = details?.expires_at ? Date.parse(details.expires_at) : Number.NaN;
  const stackedFromOpenTerm =
    !rawNextPaymentDate && Number.isFinite(openUntilMs) && openUntilMs > chargedAt.getTime()
      ? capturedRenewalAccess({
          billingPeriod: billingPeriodForExpiry,
          chargedAt: chargedAt.toISOString(),
          currentExpiresAt: details?.expires_at,
          currentPlanId: details?.plan_id,
          currentBillingPeriod: details?.billing_period,
          now,
        })
      : null;
  const authoritativeMs = rawNextPaymentDate ? new Date(rawNextPaymentDate).getTime() : NaN;
  const currentExpiresMs = details?.expires_at ? new Date(details.expires_at).getTime() : NaN;
  const periodAlreadyApplied =
    (Number.isFinite(authoritativeMs) &&
      Number.isFinite(currentExpiresMs) &&
      currentExpiresMs >= authoritativeMs) ||
    (!rawNextPaymentDate && !owedPeriodEnd && Boolean(details?.expires_at));
  const stackedEndMs = stackedFromOpenTerm ? Date.parse(stackedFromOpenTerm.expiresAt) : Number.NaN;
  const expiresAt = rawNextPaymentDate
    ? new Date(rawNextPaymentDate)
    : Number.isFinite(stackedEndMs) && stackedEndMs > now.getTime()
      ? new Date(stackedEndMs)
      : new Date(owedPeriodEnd ?? details?.expires_at ?? computedPeriodEnd);
  const nextPaymentDate = rawNextPaymentDate || expiresAt;

  const renewalBillingPeriod = details?.billing_period === "yearly" ? "yearly" : "monthly";
  const accessEndMs =
    periodAlreadyApplied && details?.expires_at
      ? Date.parse(details.expires_at)
      : expiresAt.getTime();
  const accessEnd =
    Number.isFinite(accessEndMs) && (accessEndMs > Date.now() || periodAlreadyApplied)
      ? new Date(accessEndMs).toISOString()
      : null;
  const { data: bookedPayment } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("provider_id", providerId)
    .eq("transaction_type", "provider_subscription_payment")
    .maybeSingle();
  const periodAlreadyBooked = Boolean((bookedPayment as { id?: string } | null)?.id);
  const duplicateChargeRef =
    periodAlreadyApplied && !paymentAlreadySaved && periodAlreadyBooked
      ? typeof (payload as { transaction?: { reference?: string } }).transaction?.reference === "string"
        ? (payload as { transaction: { reference: string } }).transaction.reference.trim()
        : ""
      : "";
  if (duplicateChargeRef) {
    const rememberReturnedRenewalCharge = async () => {
      const reason = "This period was already paid. The extra renewal charge was returned.";
      const refundedAt = new Date().toISOString();
      const { data: existingCharge } = await supabase
        .from("payment_transactions")
        .select("status")
        .eq("provider", "paystack")
        .eq("reference", txnReference)
        .maybeSingle();
      const existingChargeStatus = String(
        (existingCharge as { status?: string } | null)?.status ?? "",
      ).toLowerCase();
      if (existingChargeStatus === "refunded" || existingChargeStatus === "partially_refunded") {
        return;
      }
      if (existingChargeStatus === "success") {
        await rememberReturnedProviderSubscriptionCharge({
          supabase,
          providerId,
          reference: txnReference,
          tenantId: details?.tenant_id ?? null,
          reason,
        });
      }
      if (existingChargeStatus) {
        const { error: markError } = await supabase
          .from("payment_transactions")
          .update({
            status: "refunded",
            refund_amount: amountInCurrency,
            refund_reason: reason,
            refunded_at: refundedAt,
          })
          .eq("provider", "paystack")
          .eq("reference", txnReference)
          .neq("status", "refunded");
        if (markError) throw markError;
        return;
      }
      const { error } = await supabase.from("payment_transactions").insert({
        booking_id: null,
        reference: txnReference,
        amount: amountInCurrency,
        fees: feesInCurrency,
        net_amount: netAmount,
        status: "refunded",
        provider: "paystack",
        transaction_type: "provider_subscription_payment",
        refund_amount: amountInCurrency,
        refund_reason: reason,
        refunded_at: refundedAt,
        metadata: {
          kind: "subscription_renewal_returned",
          provider_id: providerId,
          subscription_code: subscriptionCode,
          invoice_code: invoiceCode ?? null,
        },
        created_at: refundedAt,
      });
      if (error && (error as { code?: string }).code !== "23505") {
        throw new Error(`could not remember returned renewal ${txnReference}`);
      }
      if ((error as { code?: string } | null)?.code === "23505") {
        const { data: racedCharge } = await supabase
          .from("payment_transactions")
          .select("status")
          .eq("provider", "paystack")
          .eq("reference", txnReference)
          .maybeSingle();
        const racedStatus = String(
          (racedCharge as { status?: string } | null)?.status ?? "",
        ).toLowerCase();
        if (racedStatus === "success") {
          await rememberReturnedProviderSubscriptionCharge({
            supabase,
            providerId,
            reference: txnReference,
            tenantId: details?.tenant_id ?? null,
            reason,
          });
        }
        if (racedStatus && racedStatus !== "refunded" && racedStatus !== "partially_refunded") {
          const { error: markError } = await supabase
            .from("payment_transactions")
            .update({
              status: "refunded",
              refund_amount: amountInCurrency,
              refund_reason: reason,
              refunded_at: refundedAt,
            })
            .eq("provider", "paystack")
            .eq("reference", txnReference)
            .neq("status", "refunded");
          if (markError) throw markError;
        }
      }
    };
    try {
      const { createRefund } = await import("@/lib/payments/paystack-complete");
      await createRefund(
        {
          transaction: duplicateChargeRef,
          merchant_note: "This period was already paid. The extra renewal charge was returned.",
        },
        { tenantId: details?.tenant_id ?? null },
      );
      console.log(
        `[subscription] refunded duplicate renewal ${duplicateChargeRef} for ${subscriptionCode}`,
      );
      await rememberReturnedRenewalCharge();
      return;
    } catch (refundError) {
      if (paystackChargeAlreadyReturned(refundError)) {
        console.log(
          `[subscription] duplicate renewal ${duplicateChargeRef} was already returned`,
        );
        await rememberReturnedRenewalCharge();
        return;
      }
      console.warn(
        `[subscription] duplicate renewal refund failed for ${duplicateChargeRef}:`,
        refundError,
      );
    }
  }
  let notifyRenewal = !paymentAlreadySaved;
  const payment = await recordProviderSubscriptionPayment({
    supabase,
    reference: txnReference,
    providerId,
    amountMajor: amountInCurrency,
    feesMajor: feesInCurrency,
    planId: details?.plan_id ?? null,
    subscriptionCode,
    invoiceCode: invoiceCode ?? null,
    paymentTransactionType: "provider_subscription_payment",
    kind: "subscription_renewal",
    description: "Provider subscription renewal payment",
    tenantIdHint: details?.tenant_id ?? null,
    billingPeriod: renewalBillingPeriod,
    termEndsAt: accessEnd,
    updateBillingPeriod: false,
  });
  if (!payment.recorded && !payment.alreadyRecorded) {
    throw new Error("subscription payment was not recorded");
  }
  if (payment.chargeReturned) return;
  const latestMerchant = await loadProviderSubscriptionByPaystackCode(supabase, subscriptionCode);
  if (shouldIgnorePaystackEventForRow(latestMerchant)) {
    if (!(paymentAlreadySaved && periodAlreadyApplied)) {
      await returnRecordedPaystackSubscriptionCharge({
        supabase,
        reference: txnReference,
        providerId,
        tenantId: details?.tenant_id ?? null,
        amountMajor: amountInCurrency,
        financeTransactionId: payment.financeTransactionId,
      });
    }
    return;
  }
  const { data: latestPayment } = await supabase
    .from("payment_transactions")
    .select("status")
    .eq("provider", "paystack")
    .eq("reference", txnReference)
    .maybeSingle();
  const latestPaymentStatus = String(
    (latestPayment as { status?: string } | null)?.status ?? "",
  ).toLowerCase();
  if (latestPaymentStatus === "refunded" || latestPaymentStatus === "partially_refunded") return;
  notifyRenewal = payment.recorded;

  const storeEndMs = expiresAt.getTime();
  const recognizedEndMs = payment.termEnd ? Date.parse(payment.termEnd) : Number.NaN;
  const grantedEnd =
    Number.isFinite(storeEndMs) && storeEndMs > Date.now()
      ? expiresAt.toISOString()
      : Number.isFinite(recognizedEndMs) && recognizedEndMs > Date.now()
        ? new Date(recognizedEndMs).toISOString()
        : computePaidPeriodExpiresAt(renewalBillingPeriod, new Date());

  if (!periodAlreadyApplied) {
    const { data: opened, error: openError } = await supabase
      .from("provider_subscriptions")
      .update({
        status: "active",
        past_due_since: null,
        last_payment_date: new Date(paidAt).toISOString(),
        expires_at: grantedEnd,
        billing_period_start: renewalPeriodStartIso(
          details?.expires_at,
          new Date(paidAt).toISOString(),
          grantedEnd,
        ),
        billing_period_end: grantedEnd,
        next_payment_date: grantedEnd,
        ...paystackActivationFields(),
      })
      .eq("paystack_subscription_code", subscriptionCode)
      .in("billing_provider", ["paystack", "manual"])
      .select("id");
    if (openError) throw openError;
    if (!opened?.length) {
      await returnRecordedPaystackSubscriptionCharge({
        supabase,
        reference: txnReference,
        providerId,
        tenantId: details?.tenant_id ?? null,
        amountMajor: amountInCurrency,
        financeTransactionId: payment.financeTransactionId,
      });
      return;
    }
  }

  if (notifyRenewal && subscriptionDetails) {
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
            next_payment_date: new Date(grantedEnd).toLocaleDateString(),
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
    .select("provider_id, plan_id, status, billing_provider, past_due_since, updated_at, next_payment_date")
    .eq("paystack_subscription_code", subscriptionCode)
    .single();

  if (!subscription) {
    const byCustomer = await loadProviderSubscriptionForPaystackCustomer(supabase, {
      email: payload.customer?.email,
      customerCode: payload.customer?.customer_code || payload.customer_code,
    });
    if (shouldIgnorePaystackEventForRow(byCustomer) && byCustomer?.provider_id) {
      const chargeRef =
        eventType === "invoice.update" && payload.status === "success" && payload.paid_at
          ? typeof (payload as { transaction?: { reference?: string } }).transaction?.reference ===
            "string"
            ? (payload as { transaction: { reference: string } }).transaction.reference.trim()
            : ""
          : "";
      if (chargeRef) {
        await returnPaystackChargeForOtherMerchant(supabase, {
          reference: chargeRef,
          tenantId: (byCustomer as { tenant_id?: string | null }).tenant_id ?? null,
          providerId: byCustomer.provider_id,
          amountMajor: convertFromSmallestUnit(Number(amount || 0), String(payload.currency || "ZAR")),
          invoiceCode: invoiceCode ? String(invoiceCode) : null,
        });
      }
      await trackInboundPaystackSubscription({
        supabase,
        row: byCustomer,
        subscriptionCode,
        tenantId: (byCustomer as { tenant_id?: string | null }).tenant_id ?? null,
        providerId: byCustomer.provider_id,
      });
      console.log(
        `[subscription] returned unmatched Paystack invoice for ${subscriptionCode} — ${byCustomer.billing_provider} is merchant`,
      );
      return;
    }
    console.error("Subscription not found:", subscriptionCode);
    return;
  }

  type SubRow = {
    provider_id: string;
    plan_id?: string;
    status?: string | null;
    next_payment_date?: string | null;
  };
  const providerId = (subscription as SubRow).provider_id;
  const previousStatus = (subscription as SubRow).status;

  const merchantRow = await loadProviderSubscriptionByPaystackCode(supabase, subscriptionCode);
  if (shouldIgnorePaystackEventForRow(merchantRow)) {
    const chargeRef =
      eventType === "invoice.update" && payload.status === "success" && payload.paid_at
        ? typeof (payload as { transaction?: { reference?: string } }).transaction?.reference ===
          "string"
          ? (payload as { transaction: { reference: string } }).transaction.reference.trim()
          : ""
        : "";
    if (chargeRef) {
      await returnPaystackChargeForOtherMerchant(supabase, {
        reference: chargeRef,
        tenantId: (merchantRow as { tenant_id?: string | null } | null)?.tenant_id ?? null,
        providerId,
        amountMajor: convertFromSmallestUnit(Number(amount || 0), String(payload.currency || "ZAR")),
        invoiceCode: invoiceCode ? String(invoiceCode) : null,
      });
      console.log(
        `[subscription] returned Paystack invoice ${chargeRef} — ${merchantRow?.billing_provider} is merchant for ${subscriptionCode}`,
      );
    }
    if (merchantRow?.provider_id) {
      await trackInboundPaystackSubscription({
        supabase,
        row: merchantRow,
        subscriptionCode,
        tenantId: (merchantRow as { tenant_id?: string | null }).tenant_id ?? null,
        providerId: merchantRow.provider_id,
      });
    }
    return;
  }

  if (eventType === "invoice.create") {
    const dueDate = payload.due_date || payload.period_end;
    const nextCharge = nextChargeDateUpdate(dueDate, (subscription as SubRow).next_payment_date);
    const createUpdate: Record<string, unknown> = {};
    if (nextCharge) createUpdate.next_payment_date = nextCharge;
    if (previousStatus !== "past_due") {
      createUpdate.updated_at = new Date().toISOString();
    }
    if (Object.keys(createUpdate).length > 0) {
      await supabase.from("provider_subscriptions")
        .update(createUpdate)
        .eq("paystack_subscription_code", subscriptionCode);
    }
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

    const updatePayload: Record<string, unknown> = {};
    const touchedAt = new Date().toISOString();
    const nextCharge = nextChargeDateUpdate(dueDate, (subscription as SubRow).next_payment_date);
    if (nextCharge) updatePayload.next_payment_date = nextCharge;
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
        if (await renewalChargeAlreadySettled(supabase, ref)) {
          alreadySucceeded = true;
          break;
        }
      }
      if (alreadySucceeded) {
        console.log(
          `[subscription] skip past_due on invoice.update — renewal already succeeded for ${subscriptionCode}`,
        );
      } else if (previousStatus !== "past_due") {
        updatePayload.status = "past_due";
        updatePayload.last_dunning_retry_at = touchedAt;
        updatePayload.past_due_since = touchedAt;
        updatePayload.updated_at = touchedAt;
      }
    } else if (previousStatus !== "past_due") {
      updatePayload.updated_at = touchedAt;
    }
    if (Object.keys(updatePayload).length > 0) {
      let update = supabase
        .from("provider_subscriptions")
        .update(updatePayload)
        .eq("paystack_subscription_code", subscriptionCode);
      if (updatePayload.status === "past_due") {
        update = update.eq("status", "active");
      }
      await update;
    }
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
      if (await renewalChargeAlreadySettled(supabase, ref)) {
        console.log(
          `[subscription] skip invoice.payment_failed — renewal already settled for ref ${ref}`,
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

    if (previousStatus !== "past_due") {
      const failedAt = new Date().toISOString();
      await supabase.from("provider_subscriptions")
        .update({
          status: "past_due",
          last_dunning_retry_at: failedAt,
          past_due_since: failedAt,
          updated_at: failedAt,
        })
        .eq("paystack_subscription_code", subscriptionCode)
        .eq("status", "active");
    }

    await supabase.from("payment_transactions").insert({
      booking_id: null,
      reference: failedReference,
      amount: convertFromSmallestUnit(amount, payload.currency || "ZAR"),
      fees: convertFromSmallestUnit(fees, payload.currency || "ZAR"),
      net_amount: convertFromSmallestUnit(amount - fees, payload.currency || "ZAR"),
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
              amount: `${convertFromSmallestUnit(amount, payload.currency || "ZAR")}`,
              app_url: process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com",
              grace_days: "3",
              access_note: subscriptionPaymentFailedAccessNote(
                previousStatus !== "past_due" ||
                  isPastDueWithinGrace({
                    billingProvider: (subscription as { billing_provider?: string | null }).billing_provider,
                    pastDueSince: (subscription as { past_due_since?: string | null }).past_due_since,
                    updatedAt: (subscription as { updated_at?: string | null }).updated_at,
                    nowIso: new Date().toISOString(),
                    graceCutoffIso: new Date(
                      Date.now() - SUBSCRIPTION_PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000,
                    ).toISOString(),
                  }),
              ),
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
