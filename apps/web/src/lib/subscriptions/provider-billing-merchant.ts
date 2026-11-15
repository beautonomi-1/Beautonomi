/**
 * Single merchant-of-record helpers for provider platform subscriptions.
 * Paystack (Android/web) vs Apple IAP (iOS) must not double-charge or lock each other out.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAppleBillingActive } from "@/lib/iap/apple/billing-active";
import { savedCardRenewalPeriodAnchorMs } from "@/lib/subscriptions/dunning-retry";
import { disableSubscriptionByCode } from "@/lib/payments/paystack-complete";
import { createRefund } from "@/lib/payments/paystack-complete";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";

export type ProviderSubscriptionRow = {
  provider_id?: string;
  billing_provider?: string | null;
  status?: string | null;
  paystack_subscription_code?: string | null;
  auto_renew?: boolean | null;
  cancelled_at?: string | null;
  expires_at?: string | null;
  scheduled_plan_id?: string | null;
  plan?: { is_free?: boolean | null } | null;
};

const LIVE_PAYSTACK_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Paystack webhook/event handlers must no-op when Apple is still merchant of record. */
export function shouldIgnorePaystackEventForRow(
  row: ProviderSubscriptionRow | null | undefined,
): boolean {
  if (!row) return false;
  if (isAppleBillingActive(row.billing_provider, row.status)) return true;
  const bp = String(row.billing_provider ?? "").toLowerCase();
  return bp === "stripe" || bp === "flutterwave";
}

/**
 * A checkout charged by the processor that already bills this plan.
 * Paystack events stay ignored for Stripe, Flutterwave, and Apple.
 */
export function checkoutPaymentOwnsPlan(
  paymentProvider: string | null | undefined,
  row: ProviderSubscriptionRow | null | undefined,
): boolean {
  const paidBy = String(paymentProvider ?? "").toLowerCase();
  const billedBy = String(row?.billing_provider ?? "").toLowerCase();
  if (paidBy !== "stripe" && paidBy !== "flutterwave") return false;
  return paidBy === billedBy;
}

export function flutterwaveActivationFields(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    billing_provider: "flutterwave",
    paystack_sync_pending: false,
    paystack_sync_note: null,
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

/** Fields applied whenever Paystack activates or renews paid access locally. */
export function paystackActivationFields(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    billing_provider: "paystack",
    paystack_sync_pending: false,
    paystack_sync_note: null,
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

/** Fields applied when Stripe (not Paystack) activates paid provider subscription access. */
export function stripeActivationFields(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    billing_provider: "stripe",
    paystack_sync_pending: false,
    paystack_sync_note: null,
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

export function subscriptionActivationFields(
  paymentProvider: "paystack" | "stripe" | "flutterwave",
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  if (paymentProvider === "stripe") return stripeActivationFields(extra);
  if (paymentProvider === "flutterwave") return flutterwaveActivationFields(extra);
  return paystackActivationFields(extra);
}

/**
 * Stop the Paystack subscription before the local code is removed.
 * A failed stop keeps the code so a later run can try again.
 */
export const PAYSTACK_STOP_FAILED_NOTE =
  "We could not stop automatic billing. Contact support if charges continue.";

export function paystackCodeAfterStop(
  stop: "cleared" | "kept" | "none",
): Record<string, unknown> {
  if (stop === "kept") {
    return {
      paystack_sync_pending: true,
      paystack_sync_note: PAYSTACK_STOP_FAILED_NOTE,
    };
  }
  return {
    paystack_subscription_code: null,
    paystack_sync_pending: false,
    paystack_sync_note: null,
  };
}

export async function stopPaystackSubscriptionBeforeClear(input: {
  supabase: SupabaseClient;
  code: string | null | undefined;
  tenantId?: string | null;
  providerId?: string | null;
}): Promise<"cleared" | "kept" | "none"> {
  const code = String(input.code ?? "").trim();
  if (!code) return "none";
  try {
    const tenantId = await resolveTenantIdForFinanceLedger(input.supabase, {
      tenant_id: input.tenantId ?? null,
      provider_id: input.providerId ?? null,
    });
    await disableSubscriptionByCode(code, { tenantId });
    return "cleared";
  } catch (error) {
    console.warn("[provider_subscription] failed to disable Paystack subscription:", error);
    return "kept";
  }
}

/**
 * Paystack invoices collect a past-due row that still has a Paystack subscription,
 * including a plan set to manual billing while that subscription is still on file.
 * A second saved-card retry would charge that card again.
 */
export function paystackSubscriptionCollectsRenewal(
  billingProvider: string | null | undefined,
  paystackSubscriptionCode: string | null | undefined,
): boolean {
  const provider = String(billingProvider ?? "paystack").toLowerCase();
  if (!paystackSubscriptionCode?.trim()) return false;
  return provider === "paystack" || provider === "manual";
}

/** Case-insensitive email match. `_` and `%` stay literal. */
export function paystackCustomerEmailPattern(email: string): string {
  return email.trim().replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** The provider row for a Paystack customer email or customer code. */
export async function loadProviderSubscriptionForPaystackCustomer(
  supabase: SupabaseClient,
  input: { email?: string | null; customerCode?: string | null },
): Promise<ProviderSubscriptionRow | null> {
  const email = input.email?.trim();
  if (email) {
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .ilike("email", paystackCustomerEmailPattern(email))
      .maybeSingle();
    const userId = (user as { id?: string } | null)?.id;
    if (userId) {
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      const providerId = (provider as { id?: string } | null)?.id;
      if (providerId) return loadProviderSubscriptionByProviderId(supabase, providerId);
    }
  }
  const customerCode = input.customerCode?.trim();
  if (!customerCode) return null;
  const { data } = await supabase
    .from("provider_subscriptions")
    .select("provider_id")
    .eq("paystack_customer_code", customerCode)
    .maybeSingle();
  const providerId = (data as { provider_id?: string } | null)?.provider_id;
  if (!providerId) return null;
  return loadProviderSubscriptionByProviderId(supabase, providerId);
}

/**
 * Another billing account owns the plan. Keep this Paystack subscription code on the
 * row when it is still billing, so a later charge can be matched and returned.
 */
export async function trackInboundPaystackSubscription(input: {
  supabase: SupabaseClient;
  row: ProviderSubscriptionRow;
  subscriptionCode: string;
  tenantId?: string | null;
  providerId: string;
}): Promise<void> {
  const subscriptionCode = input.subscriptionCode.trim();
  if (!subscriptionCode) return;
  const stop = await stopPaystackSubscriptionBeforeClear({
    supabase: input.supabase,
    code: subscriptionCode,
    tenantId: input.tenantId,
    providerId: input.providerId,
  });
  const existingCode = input.row.paystack_subscription_code?.trim() || "";
  let trackStop = stop;
  if (existingCode && existingCode !== subscriptionCode) {
    if (stop !== "kept") {
      console.warn(
        `[subscription.create] Paystack ${subscriptionCode} is stopped; row still tracks ${existingCode}`,
      );
      return;
    }
    const previousStop = await stopPaystackSubscriptionBeforeClear({
      supabase: input.supabase,
      code: existingCode,
      tenantId: input.tenantId,
      providerId: input.providerId,
    });
    if (previousStop === "kept") {
      console.warn(
        `[subscription.create] Paystack ${subscriptionCode} is still billing; row still tracks ${existingCode}`,
      );
      return;
    }
    trackStop = "kept";
  }
  await input.supabase
    .from("provider_subscriptions")
    .update({
      paystack_subscription_code: subscriptionCode,
      paystack_sync_note: trackStop === "kept" ? PAYSTACK_STOP_FAILED_NOTE : null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_id", input.providerId);
}

/** After Apple expiry, refund, or downgrade to free — allow Android/web Paystack again. */
export function clearAppleMerchantOnFree(
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    billing_provider: "paystack",
    updated_at: new Date().toISOString(),
    ...extra,
  };
}

export function computePaidPeriodExpiresAt(
  billingPeriod: "monthly" | "yearly",
  from: Date = new Date(),
): string {
  const expiresAt = new Date(from);
  const day = expiresAt.getDate();
  expiresAt.setDate(1);
  if (billingPeriod === "yearly") {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }
  const lastDayOfTargetMonth = new Date(
    expiresAt.getFullYear(),
    expiresAt.getMonth() + 1,
    0,
  ).getDate();
  expiresAt.setDate(Math.min(day, lastDayOfTargetMonth));
  return expiresAt.toISOString();
}

/**
 * A same-plan checkout while the current term is still open buys the next
 * slice after that term. A different plan, or a term that has already ended,
 * starts when the card is charged.
 */
export function checkoutRenewalAccess(input: {
  billingPeriod: "monthly" | "yearly";
  paidAt: Date;
  currentPlanId?: string | null;
  currentBillingPeriod?: string | null;
  currentExpiresAt?: string | null;
  orderPlanId: string;
  chargePeriodEnd: string;
}): { expiresAt: string; periodStart: string } {
  const samePlan =
    input.currentPlanId === input.orderPlanId &&
    (input.currentBillingPeriod ?? "monthly") === input.billingPeriod;
  const anchorMs = savedCardRenewalPeriodAnchorMs(input.currentExpiresAt, input.paidAt.getTime());
  if (samePlan && anchorMs > input.paidAt.getTime()) {
    const start = new Date(anchorMs);
    return {
      expiresAt: computePaidPeriodExpiresAt(input.billingPeriod, start),
      periodStart: start.toISOString(),
    };
  }
  return {
    expiresAt: input.chargePeriodEnd,
    periodStart: input.paidAt.toISOString(),
  };
}

/** The recognition window starts at the current end when that end is still before the new one. */
export function renewalPeriodStartIso(
  currentExpiresAt: string | null | undefined,
  paidAtIso: string,
  grantedEndIso: string,
): string {
  const paidAtMs = Date.parse(paidAtIso);
  const paidAt = Number.isFinite(paidAtMs) ? paidAtMs : Date.now();
  const anchorMs = savedCardRenewalPeriodAnchorMs(currentExpiresAt, paidAt);
  const grantedMs = Date.parse(grantedEndIso);
  if (Number.isFinite(grantedMs) && anchorMs < grantedMs) {
    return new Date(anchorMs).toISOString();
  }
  return new Date(paidAt).toISOString();
}

/**
 * A later delivery of the same checkout must not add another period.
 * The stored grant is the end date chosen on the first delivery.
 */
export function checkoutGrantAlreadyApplied(input: {
  alreadyStored: boolean;
  currentPlanId?: string | null;
  currentBillingPeriod?: string | null;
  currentExpiresAt?: string | null;
  orderPlanId: string;
  billingPeriod: "monthly" | "yearly";
  grantedExpiresAt: string;
}): boolean {
  if (!input.alreadyStored) return false;
  if (input.currentPlanId !== input.orderPlanId) return false;
  if ((input.currentBillingPeriod ?? "monthly") !== input.billingPeriod) return false;
  const currentMs = input.currentExpiresAt ? Date.parse(input.currentExpiresAt) : Number.NaN;
  const grantedMs = Date.parse(input.grantedExpiresAt);
  return Number.isFinite(currentMs) && Number.isFinite(grantedMs) && currentMs >= grantedMs;
}

export function readCheckoutGrant(
  metadata: unknown,
): { expiresAt: string; periodStart: string } | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const row = metadata as { checkout_period_end?: unknown; checkout_period_start?: unknown };
  const expiresAt = typeof row.checkout_period_end === "string" ? row.checkout_period_end.trim() : "";
  const periodStart = typeof row.checkout_period_start === "string" ? row.checkout_period_start.trim() : "";
  if (!expiresAt || !periodStart) return null;
  return { expiresAt, periodStart };
}

export async function rememberCheckoutGrant(
  supabase: SupabaseClient,
  input: {
    paymentProvider: string;
    reference: string;
    granted: { expiresAt: string; periodStart: string };
  },
): Promise<{ expiresAt: string; periodStart: string; alreadyStored: boolean }> {
  const { data, error } = await supabase
    .from("payment_transactions")
    .select("id, metadata")
    .eq("provider", input.paymentProvider)
    .eq("reference", input.reference)
    .maybeSingle();
  if (error) throw error;
  const payment = data as { id?: string; metadata?: unknown } | null;
  const stored = readCheckoutGrant(payment?.metadata);
  if (stored) return { ...stored, alreadyStored: true };
  if (!payment?.id) return { ...input.granted, alreadyStored: false };

  const metadata =
    payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
      ? (payment.metadata as Record<string, unknown>)
      : {};
  const { error: updateError } = await supabase
    .from("payment_transactions")
    .update({
      metadata: {
        ...metadata,
        checkout_period_end: input.granted.expiresAt,
        checkout_period_start: input.granted.periodStart,
      },
    })
    .eq("id", payment.id);
  if (updateError) throw updateError;

  const { data: again, error: readError } = await supabase
    .from("payment_transactions")
    .select("metadata")
    .eq("id", payment.id)
    .maybeSingle();
  if (readError) throw readError;
  const raced = readCheckoutGrant((again as { metadata?: unknown } | null)?.metadata);
  if (
    raced &&
    (raced.expiresAt !== input.granted.expiresAt || raced.periodStart !== input.granted.periodStart)
  ) {
    return { ...raced, alreadyStored: true };
  }
  return { ...input.granted, alreadyStored: false };
}

/** Paystack's next charge is the access end when that date is still ahead. */
export function accessEndFromNextCharge(
  nextPaymentDate: string | null | undefined,
  billingPeriod: "monthly" | "yearly",
  now = new Date(),
): string {
  const ms = nextPaymentDate ? Date.parse(nextPaymentDate) : Number.NaN;
  if (Number.isFinite(ms) && ms > now.getTime()) return new Date(ms).toISOString();
  return computePaidPeriodExpiresAt(billingPeriod, now);
}

/**
 * The end date a captured renewal already paid for, measured from the charge.
 * Null means that end date is already on the subscription.
 */
export function capturedRenewalPeriodEnd(
  billingPeriod: "monthly" | "yearly",
  chargedAt: string | null | undefined,
  currentExpiresAt: string | null | undefined,
): string | null {
  const from = chargedAt ? new Date(chargedAt) : null;
  if (!from || !Number.isFinite(from.getTime())) return null;
  const periodEnd = computePaidPeriodExpiresAt(billingPeriod, from);
  const currentMs = currentExpiresAt ? new Date(currentExpiresAt).getTime() : NaN;
  if (Number.isFinite(currentMs) && currentMs >= new Date(periodEnd).getTime()) return null;
  return periodEnd;
}

/**
 * A captured renewal whose charge happened while the term was still open
 * buys the next slice after that term. A charge period that has already
 * ended opens from now. Null means this charge's period is already on the row.
 */
export function capturedRenewalAccess(input: {
  billingPeriod: "monthly" | "yearly";
  chargedAt: string;
  currentExpiresAt?: string | null;
  currentPlanId?: string | null;
  currentBillingPeriod?: string | null;
  now?: Date;
}): { expiresAt: string; periodStart: string } | null {
  const chargedMs = Date.parse(input.chargedAt);
  if (!Number.isFinite(chargedMs)) return null;
  const now = input.now ?? new Date();
  const fromCharge = capturedRenewalPeriodEnd(
    input.billingPeriod,
    input.chargedAt,
    input.currentExpiresAt,
  );
  if (!fromCharge) return null;
  const chargePeriodEnd =
    Date.parse(fromCharge) > now.getTime()
      ? fromCharge
      : computePaidPeriodExpiresAt(input.billingPeriod, now);
  const renewal = checkoutRenewalAccess({
    billingPeriod: input.billingPeriod,
    paidAt: new Date(chargedMs),
    currentPlanId: input.currentPlanId ?? "",
    currentBillingPeriod: input.currentBillingPeriod ?? input.billingPeriod,
    currentExpiresAt: input.currentExpiresAt,
    orderPlanId: input.currentPlanId ?? "",
    chargePeriodEnd,
  });
  if (Date.parse(renewal.expiresAt) <= now.getTime()) {
    return {
      expiresAt: computePaidPeriodExpiresAt(input.billingPeriod, now),
      periodStart: now.toISOString(),
    };
  }
  return renewal;
}

/**
 * Fields a subscription.create delivery may write onto access.
 * An end date that is already at or after this event's period stays as it is.
 * A missing period opens from Paystack's next charge date, or from the
 * subscription start when that date is absent. A date that has already
 * passed opens one period from now.
 */
export function subscriptionCreateAccessUpdate(input: {
  billingPeriod: "monthly" | "yearly";
  nextPaymentDate?: string | null;
  createdAt?: string | null;
  currentExpiresAt?: string | null;
  currentStartedAt?: string | null;
  currentStatus?: string | null;
  eventStatus?: "active" | "past_due";
  now?: Date;
}): {
  expires_at?: string;
  started_at?: string;
  status?: "active" | "past_due";
  past_due_since?: string | null;
  updated_at?: string;
  applyPlan: boolean;
  clearPendingUpgrade: boolean;
} {
  const now = input.now ?? new Date();
  const created = input.createdAt ? new Date(input.createdAt) : null;
  const from = created && Number.isFinite(created.getTime()) ? created : now;
  const nextMs = input.nextPaymentDate ? new Date(input.nextPaymentDate).getTime() : NaN;
  let periodEnd = Number.isFinite(nextMs)
    ? new Date(nextMs).toISOString()
    : computePaidPeriodExpiresAt(input.billingPeriod, from);
  const currentMs = input.currentExpiresAt ? new Date(input.currentExpiresAt).getTime() : NaN;
  const applied = Number.isFinite(currentMs) && currentMs >= new Date(periodEnd).getTime();
  if (!applied && new Date(periodEnd).getTime() <= now.getTime()) {
    periodEnd = computePaidPeriodExpiresAt(input.billingPeriod, now);
  }
  const fields: {
    expires_at?: string;
    started_at?: string;
    status?: "active" | "past_due";
    past_due_since?: string | null;
    updated_at?: string;
    applyPlan: boolean;
    clearPendingUpgrade: boolean;
  } = { applyPlan: !applied, clearPendingUpgrade: !applied };
  if (!input.currentStartedAt) fields.started_at = from.toISOString();
  if (!applied) {
    fields.expires_at = periodEnd;
    fields.status = input.eventStatus ?? "active";
    fields.updated_at = now.toISOString();
    if (fields.status === "past_due" && input.currentStatus !== "past_due") {
      fields.past_due_since = now.toISOString();
    }
    if (fields.status === "active") fields.past_due_since = null;
  } else if (input.currentStatus !== "past_due") {
    fields.updated_at = now.toISOString();
  }
  return fields;
}

/**
 * Fields a subscription.enable delivery may write.
 * A missing, earlier, or already stored charge date does not turn renewal
 * back on or clear a later date. A past-due row keeps its grace timestamp.
 */
export function subscriptionEnableUpdate(input: {
  nextPaymentDate?: string | null;
  currentNextPaymentDate?: string | null;
  currentStatus?: string | null;
  now?: Date;
}): Record<string, unknown> {
  const now = input.now ?? new Date();
  const eventMs = input.nextPaymentDate ? new Date(input.nextPaymentDate).getTime() : NaN;
  const currentMs = input.currentNextPaymentDate
    ? new Date(input.currentNextPaymentDate).getTime()
    : NaN;
  const eventIsFuture = Number.isFinite(eventMs) && eventMs > now.getTime();
  const alreadyStored = Number.isFinite(eventMs) && Number.isFinite(currentMs) && currentMs >= eventMs;
  if (!eventIsFuture || alreadyStored) return {};
  const fields: Record<string, unknown> = {
    status: "active",
    auto_renew: true,
    cancelled_at: null,
    next_payment_date: new Date(eventMs).toISOString(),
    past_due_since: null,
  };
  if (input.currentStatus !== "past_due") fields.updated_at = now.toISOString();
  return fields;
}

/** A later charge date replaces the stored one. An earlier or unreadable date does not. */
export function nextChargeDateUpdate(
  incoming: string | null | undefined,
  current: string | null | undefined,
): string | null {
  const incomingMs = incoming ? Date.parse(incoming) : Number.NaN;
  if (!Number.isFinite(incomingMs)) return null;
  const currentMs = current ? Date.parse(current) : Number.NaN;
  if (Number.isFinite(currentMs) && currentMs >= incomingMs) return null;
  return new Date(incomingMs).toISOString();
}

/**
 * A not_renew delivery whose charge date is earlier than the stored date
 * belongs to the period before a later enable. Renewal stays on.
 * A past-due row keeps its grace timestamp.
 */
export function subscriptionNotRenewUpdate(input: {
  nextPaymentDate?: string | null;
  currentNextPaymentDate?: string | null;
  currentStatus?: string | null;
  now?: Date;
}): Record<string, unknown> {
  const eventMs = input.nextPaymentDate ? new Date(input.nextPaymentDate).getTime() : NaN;
  const currentMs = input.currentNextPaymentDate
    ? new Date(input.currentNextPaymentDate).getTime()
    : NaN;
  if (Number.isFinite(eventMs) && Number.isFinite(currentMs) && eventMs < currentMs) return {};
  const fields: Record<string, unknown> = { auto_renew: false };
  if (input.currentStatus !== "past_due") {
    fields.updated_at = (input.now ?? new Date()).toISOString();
  }
  return fields;
}

/** A disable for an earlier charge date must not cancel a later renewal. */
export function subscriptionDisableApplies(input: {
  nextPaymentDate?: string | null;
  currentNextPaymentDate?: string | null;
}): boolean {
  const eventMs = input.nextPaymentDate ? new Date(input.nextPaymentDate).getTime() : NaN;
  const currentMs = input.currentNextPaymentDate
    ? new Date(input.currentNextPaymentDate).getTime()
    : NaN;
  return !(Number.isFinite(eventMs) && Number.isFinite(currentMs) && eventMs < currentMs);
}

/**
 * Card and plan fields saved while an authorization is linked.
 * A past-due row keeps its grace timestamp.
 */
export function authorizationLinkPatch(input: {
  planId: string;
  billingPeriod: "monthly" | "yearly";
  authorizationCode?: string | null;
  customerCode?: string | null;
  status?: string | null;
  now?: Date;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    plan_id: input.planId,
    billing_period: input.billingPeriod,
    paystack_customer_code: input.customerCode ?? null,
  };
  if (input.authorizationCode) patch.paystack_authorization_code = input.authorizationCode;
  if (input.status !== "past_due") {
    patch.updated_at = (input.now ?? new Date()).toISOString();
  }
  return patch;
}

/** Plan, renewal, and card fields a subscription.create delivery may replace. */
export function subscriptionCreatePlanPatch(input: {
  applyPlan: boolean;
  planId: string;
  billingPeriod: "monthly" | "yearly";
  nextPaymentDate?: string | null;
  authorizationCode?: string | null;
}): Record<string, unknown> {
  if (!input.applyPlan) return {};
  return {
    plan_id: input.planId,
    billing_period: input.billingPeriod,
    auto_renew: true,
    next_payment_date: input.nextPaymentDate
      ? new Date(input.nextPaymentDate).toISOString()
      : null,
    ...(input.authorizationCode
      ? { paystack_authorization_code: input.authorizationCode }
      : {}),
  };
}

/**
 * A saved authorization can leave the subscription on the old end date.
 * The next delivery opens that charge's period. It does not add a second one,
 * and it leaves a period that is already open.
 */
export async function openSavedAuthorizationPeriod(input: {
  supabase: SupabaseClient;
  providerId: string;
  reference: string;
  paymentProvider: "paystack" | "stripe" | "flutterwave";
  billingPeriod: "monthly" | "yearly";
  now?: Date;
}): Promise<{ status: "opened" | "unchanged"; expiresAt: string | null }> {
  const { data: existingSub, error: subError } = await input.supabase
    .from("provider_subscriptions")
    .select("id, status, plan_id, billing_period, expires_at, paystack_subscription_code, tenant_id")
    .eq("provider_id", input.providerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (subError) throw subError;
  const row = existingSub as {
    id?: string;
    status?: string | null;
    plan_id?: string | null;
    billing_period?: string | null;
    expires_at?: string | null;
    paystack_subscription_code?: string | null;
    tenant_id?: string | null;
  } | null;
  if (!row?.id) return { status: "unchanged", expiresAt: null };

  const { data: savedPayments, error: savedPaymentError } = await input.supabase
    .from("payment_transactions")
    .select("created_at, metadata")
    .eq("provider", input.paymentProvider)
    .eq("reference", input.reference)
    .eq("status", "success")
    .limit(1);
  if (savedPaymentError) throw savedPaymentError;
  const payment = savedPayments?.[0] as
    | { created_at?: string; metadata?: unknown }
    | undefined;
  const chargedAt = payment?.created_at;
  const grant = readCheckoutGrant(payment?.metadata);
  const paymentPlanId =
    payment?.metadata &&
    typeof payment.metadata === "object" &&
    !Array.isArray(payment.metadata) &&
    typeof (payment.metadata as { plan_id?: unknown }).plan_id === "string"
      ? (payment.metadata as { plan_id: string }).plan_id
      : "";
  const now = input.now ?? new Date();
  let expiresAt: string;
  let periodStart: string;
  if (grant) {
    if (paymentPlanId && row.plan_id && paymentPlanId !== row.plan_id) {
      return { status: "unchanged", expiresAt: null };
    }
    if (
      checkoutGrantAlreadyApplied({
        alreadyStored: true,
        currentPlanId: row.plan_id,
        currentBillingPeriod: row.billing_period,
        currentExpiresAt: row.expires_at,
        orderPlanId: paymentPlanId || row.plan_id || "",
        billingPeriod: input.billingPeriod,
        grantedExpiresAt: grant.expiresAt,
      })
    ) {
      return { status: "unchanged", expiresAt: null };
    }
    expiresAt = grant.expiresAt;
    periodStart = grant.periodStart;
  } else {
    if (subscriptionPeriodAlreadyOpen(row.status, row.expires_at)) {
      return { status: "unchanged", expiresAt: null };
    }
    if (!chargedAt) return { status: "unchanged", expiresAt: null };
    const access = capturedRenewalAccess({
      billingPeriod: input.billingPeriod,
      chargedAt,
      currentExpiresAt: row.expires_at,
      currentPlanId: row.plan_id,
      currentBillingPeriod: row.billing_period,
      now,
    });
    if (!access) return { status: "unchanged", expiresAt: null };
    expiresAt = access.expiresAt;
    periodStart = access.periodStart;
  }

  const previousCode = String(row.paystack_subscription_code ?? "").trim();
  const paystackStop =
    input.paymentProvider === "paystack" || !previousCode
      ? "none"
      : await stopPaystackSubscriptionBeforeClear({
          supabase: input.supabase,
          code: previousCode,
          tenantId: row.tenant_id,
          providerId: input.providerId,
        });

  const { error: periodError } = await input.supabase
    .from("provider_subscriptions")
    .update({
      status: "active",
      past_due_since: null,
      expires_at: expiresAt,
      billing_period_start: periodStart,
      billing_period_end: expiresAt,
      ...subscriptionActivationFields(input.paymentProvider),
    })
    .eq("id", row.id);
  if (periodError) throw periodError;
  if (paystackStop === "cleared" && row.id) {
    await input.supabase
      .from("provider_subscriptions")
      .update({
        paystack_subscription_code: null,
        paystack_sync_pending: false,
        paystack_sync_note: null,
      })
      .eq("id", row.id)
      .eq("paystack_subscription_code", previousCode);
  } else if (paystackStop === "kept" && row.id) {
    await input.supabase
      .from("provider_subscriptions")
      .update({ paystack_sync_note: PAYSTACK_STOP_FAILED_NOTE })
      .eq("id", row.id)
      .eq("paystack_subscription_code", previousCode);
  }
  return { status: "opened", expiresAt };
}

/** A paid period is already open when the row is active and its end is still ahead. */
export function subscriptionPeriodAlreadyOpen(
  status: string | null | undefined,
  expiresAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (status !== "active" || !expiresAt) return false;
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresMs) && expiresMs > nowMs;
}

export async function failPendingProviderSubscriptionOrders(
  supabase: SupabaseClient,
  providerId: string,
  failureReason: string,
): Promise<number> {
  const { data } = await supabase
    .from("provider_subscription_orders")
    .update({
      status: "failed",
      failure_reason: failureReason,
      failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("provider_id", providerId)
    .eq("status", "pending")
    .select("id");
  return data?.length ?? 0;
}

export async function disablePaystackSubscriptionForProvider(
  supabase: SupabaseClient,
  providerId: string,
  tenantId: string | null,
): Promise<"cleared" | "kept" | "none"> {
  const { data } = await supabase
    .from("provider_subscriptions")
    .select("paystack_subscription_code, tenant_id")
    .eq("provider_id", providerId)
    .maybeSingle();
  const code = (data as { paystack_subscription_code?: string | null } | null)
    ?.paystack_subscription_code?.trim();
  if (!code) return "none";
  const rowTenant = (data as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  return stopPaystackSubscriptionBeforeClear({
    supabase,
    code,
    tenantId: tenantId ?? rowTenant,
    providerId,
  });
}

/** Best-effort refund when Paystack captured a charge but Apple is MoR. */
export async function refundPaystackReferenceIfNeeded(
  reference: string,
  context?: { providerId?: string | null; tenantId?: string | null },
): Promise<void> {
  const ref = reference?.trim();
  if (!ref) return;
  try {
    await createRefund({ transaction: ref }, { tenantId: context?.tenantId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[provider-billing-merchant] createRefund failed:", ref, e);
    const { slackNotifyProviderSubscriptionAppleRefundFailed } = await import(
      "@/lib/integrations/slack/ops-triggers"
    );
    slackNotifyProviderSubscriptionAppleRefundFailed({
      tenantId: context?.tenantId ?? null,
      providerId: context?.providerId ?? null,
      reference: ref,
      reason: msg,
    });
  }
}

export function paystackChargeAlreadyReturned(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    (/refund/i.test(message) && /(already|fully)/i.test(message)) ||
    /already reversed/i.test(message)
  );
}

/** A renewal reference that was collected or returned must not start past_due. */
export async function renewalChargeAlreadySettled(
  supabase: SupabaseClient,
  reference: string,
  provider = "paystack",
): Promise<boolean> {
  const ref = reference.trim();
  if (!ref) return false;
  for (const status of ["success", "refunded", "partially_refunded"]) {
    const { data } = await supabase
      .from("payment_transactions")
      .select("id")
      .eq("provider", provider)
      .eq("reference", ref)
      .eq("status", status)
      .maybeSingle();
    if (data) return true;
  }
  return false;
}

/**
 * Paystack captured a renewal after Apple, Stripe, or Flutterwave already owns the plan.
 * Return the charge and remember it so a later failure event does not start past_due.
 */
export async function returnPaystackChargeForOtherMerchant(
  supabase: SupabaseClient,
  input: {
    reference: string;
    tenantId?: string | null;
    providerId?: string | null;
    amountMajor?: number;
    invoiceCode?: string | null;
  },
): Promise<void> {
  const ref = input.reference?.trim();
  if (!ref) return;
  const { data: existingPayment } = await supabase
    .from("payment_transactions")
    .select("status")
    .eq("provider", "paystack")
    .eq("reference", ref)
    .maybeSingle();
  const status = String(
    (existingPayment as { status?: string } | null)?.status ?? "",
  ).toLowerCase();
  if (status === "success" || status === "refunded" || status === "partially_refunded") return;
  const note = "Another billing account owns this subscription. This Paystack charge was returned.";
  try {
    await createRefund(
      { transaction: ref, merchant_note: note },
      { tenantId: input.tenantId },
    );
  } catch (error) {
    if (!paystackChargeAlreadyReturned(error)) throw error;
  }
  const amount = Number(input.amountMajor ?? 0);
  const refundedAt = new Date().toISOString();
  if (status) {
    const { error: markError } = await supabase
      .from("payment_transactions")
      .update({
        status: "refunded",
        refund_amount: amount,
        refund_reason: note,
        refunded_at: refundedAt,
      })
      .eq("provider", "paystack")
      .eq("reference", ref)
      .neq("status", "refunded");
    if (markError) throw new Error(`could not remember returned Paystack charge ${ref}`);
    return;
  }
  const { error } = await supabase.from("payment_transactions").insert({
    booking_id: null,
    reference: ref,
    amount,
    fees: 0,
    net_amount: amount,
    status: "refunded",
    provider: "paystack",
    transaction_type: "provider_subscription_payment",
    refund_amount: amount,
    refund_reason: note,
    refunded_at: refundedAt,
    metadata: {
      kind: "paystack_charge_returned_other_merchant",
      provider_id: input.providerId ?? null,
      invoice_code: input.invoiceCode ?? null,
    },
    created_at: new Date().toISOString(),
  });
  if (!error) return;
  if ((error as { code?: string }).code !== "23505") {
    throw new Error(`could not remember returned Paystack charge ${ref}`);
  }
  const { data: racedPayment } = await supabase
    .from("payment_transactions")
    .select("status")
    .eq("provider", "paystack")
    .eq("reference", ref)
    .maybeSingle();
  const racedStatus = String(
    (racedPayment as { status?: string } | null)?.status ?? "",
  ).toLowerCase();
  if (racedStatus === "refunded" || racedStatus === "partially_refunded") return;
  const providerId = input.providerId?.trim() ?? "";
  if (racedStatus === "success" && providerId) {
    const { rememberReturnedProviderSubscriptionCharge } = await import(
      "@/lib/subscriptions/provider-subscription-payment"
    );
    await rememberReturnedProviderSubscriptionCharge({
      supabase,
      providerId,
      reference: ref,
      tenantId: input.tenantId,
      reason: "Another billing account owns this subscription",
    });
  }
  const { error: markError } = await supabase
    .from("payment_transactions")
    .update({
      status: "refunded",
      refund_amount: amount,
      refund_reason: note,
      refunded_at: refundedAt,
    })
    .eq("provider", "paystack")
    .eq("reference", ref)
    .neq("status", "refunded");
  if (markError) throw new Error(`could not remember returned Paystack charge ${ref}`);
}

export function isLivePaystackSubscription(row: ProviderSubscriptionRow | null): boolean {
  if (!row) return false;
  if (row.billing_provider === "apple") return false;
  const isFree = row.plan?.is_free === true;
  if (isFree) return false;
  const status = row.status ?? "";
  const liveStatus =
    LIVE_PAYSTACK_STATUSES.has(status) || (status === "active" && Boolean(row.cancelled_at));
  if (!liveStatus) return false;
  if (row.billing_provider === "stripe" || row.billing_provider === "flutterwave") return true;
  const code = row.paystack_subscription_code?.trim();
  if (!code) return false;
  return true;
}

export async function loadProviderSubscriptionByProviderId(
  supabase: SupabaseClient,
  providerId: string,
): Promise<ProviderSubscriptionRow | null> {
  const { data } = await supabase
    .from("provider_subscriptions")
    .select(
      "provider_id, tenant_id, billing_provider, status, paystack_subscription_code, auto_renew, cancelled_at, plan:subscription_plans!plan_id(is_free)",
    )
    .eq("provider_id", providerId)
    .maybeSingle();
  return (data as ProviderSubscriptionRow | null) ?? null;
}

export async function loadProviderSubscriptionByPaystackCode(
  supabase: SupabaseClient,
  subscriptionCode: string,
): Promise<(ProviderSubscriptionRow & { provider_id: string }) | null> {
  const { data } = await supabase
    .from("provider_subscriptions")
    .select(
      "id, provider_id, tenant_id, billing_provider, status, paystack_subscription_code, cancelled_at, expires_at, next_payment_date, scheduled_plan_id, plan:subscription_plans!plan_id(is_free)",
    )
    .eq("paystack_subscription_code", subscriptionCode)
    .maybeSingle();
  if (!data) return null;
  return data as ProviderSubscriptionRow & { provider_id: string };
}
