import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processSuccessfulPayment } from "@/app/api/payments/webhook/_handlers/charge-success";
import { getCurrencyMeta } from "@beautonomi/utils";
import { getStripeClient } from "@/lib/payments/stripe-server";

type StripeChargeLike = {
  id?: string;
  amount?: number;
  currency?: string;
  balance_transaction?: { fee?: number } | string | null;
};

type StripePaymentIntentLike = {
  id?: string;
  amount?: number;
  amount_received?: number;
  currency?: string;
  metadata?: Record<string, string>;
  latest_charge?: StripeChargeLike | string | null;
  customer?: string | { id?: string } | null;
  payment_method?: string | { id?: string } | null;
  receipt_email?: string | null;
  last_payment_error?: { message?: string | null } | null;
};

type StripePaymentMethodLike = {
  id?: string;
  card?: {
    last4?: string;
    exp_month?: number;
    exp_year?: number;
    brand?: string;
  } | null;
};

type StripeSetupIntentLike = {
  id?: string;
  payment_method?: StripePaymentMethodLike | string | null;
  customer?: string | { id?: string } | null;
};

type StripeCheckoutSessionLike = {
  id?: string;
  mode?: string;
  payment_status?: string;
  status?: string;
  client_reference_id?: string | null;
  metadata?: Record<string, string>;
  amount_total?: number | null;
  currency?: string | null;
  customer?: string | { id?: string } | null;
  customer_details?: { email?: string | null } | null;
  payment_intent?: StripePaymentIntentLike | string | null;
  setup_intent?: StripeSetupIntentLike | string | null;
};

function stripeMinorToMajor(amountMinor: number | undefined, currency: string): number {
  const factor = 10 ** getCurrencyMeta(currency).minorUnits;
  return Math.round((Number(amountMinor || 0) / factor) * 100) / 100;
}

function feeMinorFromCharge(charge: StripeChargeLike | null | undefined): number {
  if (!charge || typeof charge !== "object") return 0;
  const bt = charge.balance_transaction;
  if (bt && typeof bt === "object" && typeof bt.fee === "number") return bt.fee;
  return 0;
}

function metadataRecord(raw: Record<string, string> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) {
    out[k] = v;
  }
  return out;
}

function buildChargePayload(params: {
  reference: string;
  metadata: Record<string, unknown>;
  amountMinor: number;
  feeMinor: number;
  currency: string;
  customerEmail?: string | null;
  stripeCustomerId?: string | null;
  stripePaymentMethodId?: string | null;
}): Parameters<typeof processSuccessfulPayment>[0] {
  const customer: { email?: string; customer_code?: string } = {};
  if (params.customerEmail) customer.email = params.customerEmail;
  if (params.stripeCustomerId) customer.customer_code = params.stripeCustomerId;

  const authorization =
    params.stripePaymentMethodId
      ? {
          authorization_code: params.stripePaymentMethodId,
          reusable: true,
        }
      : undefined;

  return {
    reference: params.reference,
    metadata: params.metadata,
    amount: params.amountMinor,
    fees: params.feeMinor,
    currency: params.currency,
    customer: Object.keys(customer).length ? customer : undefined,
    authorization,
    __paymentProvider: "stripe",
  };
}

function resolveReference(sessionOrIntent: {
  client_reference_id?: string | null;
  metadata?: Record<string, string>;
  id?: string;
}): string | null {
  const fromClient =
    typeof sessionOrIntent.client_reference_id === "string"
      ? sessionOrIntent.client_reference_id.trim()
      : "";
  if (fromClient) return fromClient;
  const fromMeta =
    typeof sessionOrIntent.metadata?.reference === "string"
      ? sessionOrIntent.metadata.reference.trim()
      : "";
  if (fromMeta) return fromMeta;
  return typeof sessionOrIntent.id === "string" ? sessionOrIntent.id : null;
}

function stripeCustomerId(
  customer: string | { id?: string } | null | undefined,
): string | null {
  if (typeof customer === "string" && customer.trim()) return customer.trim();
  if (customer && typeof customer === "object" && typeof customer.id === "string") {
    return customer.id.trim() || null;
  }
  return null;
}

function stripePaymentMethodId(
  pm: string | { id?: string } | null | undefined,
): string | null {
  if (typeof pm === "string" && pm.trim()) return pm.trim();
  if (pm && typeof pm === "object" && typeof pm.id === "string") {
    return pm.id.trim() || null;
  }
  return null;
}

async function resolveCheckoutSessionForSettlement(
  session: StripeCheckoutSessionLike,
): Promise<StripeCheckoutSessionLike> {
  if (!session.id) return session;
  const tenantId =
    typeof session.metadata?.tenant_id === "string" ? session.metadata.tenant_id : null;
  const needsExpand =
    session.mode === "setup" &&
    (!session.setup_intent || typeof session.setup_intent === "string");
  if (!needsExpand && session.mode !== "setup") return session;
  if (session.mode === "setup" && session.status !== "complete") return session;
  try {
    const stripe = await getStripeClient(tenantId);
    return (await stripe.checkout.sessions.retrieve(session.id, {
      expand: ["setup_intent.payment_method", "payment_intent.latest_charge.balance_transaction"],
    })) as StripeCheckoutSessionLike;
  } catch (e) {
    console.warn("[settle-stripe] could not expand checkout session", session.id, e);
    return session;
  }
}

export async function settleStripeCheckoutSession(
  session: StripeCheckoutSessionLike,
  supabase: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const resolved = await resolveCheckoutSessionForSettlement(session);

  if (resolved.mode === "setup") {
    if (resolved.status !== "complete") return;

    const reference = resolveReference(resolved);
    if (!reference) {
      console.warn("[settle-stripe] setup session missing reference", resolved.id);
      return;
    }

    const metadata = metadataRecord(resolved.metadata);
    if (resolved.id) metadata.stripe_checkout_session_id = resolved.id;

    const setupIntent =
      resolved.setup_intent && typeof resolved.setup_intent === "object"
        ? resolved.setup_intent
        : null;
    const pmRaw = setupIntent?.payment_method ?? null;
    const pm =
      pmRaw && typeof pmRaw === "object" ? pmRaw : null;
    const pmId = stripePaymentMethodId(pmRaw);
    const cusId = stripeCustomerId(resolved.customer ?? setupIntent?.customer ?? null);
    if (cusId) metadata.stripe_customer_id = cusId;
    if (pmId) metadata.stripe_payment_method_id = pmId;
    if (pm?.card?.last4) metadata.stripe_card_last4 = pm.card.last4;
    if (typeof pm?.card?.exp_month === "number") {
      metadata.stripe_card_exp_month = String(pm.card.exp_month);
    }
    if (typeof pm?.card?.exp_year === "number") {
      metadata.stripe_card_exp_year = String(pm.card.exp_year);
    }
    if (pm?.card?.brand) metadata.stripe_card_brand = pm.card.brand;

    const currency = (resolved.currency || metadata.currency || "ZAR").toString().toUpperCase();
    const email = resolved.customer_details?.email ?? null;

    await processSuccessfulPayment(
      buildChargePayload({
        reference,
        metadata,
        amountMinor: 0,
        feeMinor: 0,
        currency,
        customerEmail: email,
        stripeCustomerId: cusId,
        stripePaymentMethodId: pmId,
      }),
      supabase,
      { paymentProvider: "stripe" },
    );
    return;
  }

  if (resolved.payment_status !== "paid") {
    return;
  }

  session = resolved;

  const reference = resolveReference(session);
  if (!reference) {
    console.warn("[settle-stripe] checkout session missing reference", session.id);
    return;
  }

  const currency = (session.currency || "ZAR").toUpperCase();
  const amountMinor = Number(session.amount_total ?? 0);
  const metadata = metadataRecord(session.metadata);
  if (session.id) metadata.stripe_checkout_session_id = session.id;

  const pi =
    session.payment_intent && typeof session.payment_intent === "object"
      ? session.payment_intent
      : null;
  const charge =
    pi?.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const feeMinor = feeMinorFromCharge(charge);

  const cusId = stripeCustomerId(session.customer ?? pi?.customer ?? null);
  const pmId = stripePaymentMethodId(pi?.payment_method ?? null);
  if (cusId) metadata.stripe_customer_id = cusId;
  if (pmId) metadata.stripe_payment_method_id = pmId;
  if (pi?.id) metadata.stripe_payment_intent_id = pi.id;

  const email =
    session.customer_details?.email ??
    pi?.receipt_email ??
    null;

  await processSuccessfulPayment(
    buildChargePayload({
      reference,
      metadata,
      amountMinor,
      feeMinor,
      currency,
      customerEmail: email,
      stripeCustomerId: cusId,
      stripePaymentMethodId: pmId,
    }),
    supabase,
    { paymentProvider: "stripe" },
  );
}

export async function settleStripePaymentIntentSucceeded(
  intent: StripePaymentIntentLike,
  supabase: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const reference = resolveReference(intent);
  if (!reference) {
    return;
  }

  const currency = (intent.currency || "ZAR").toUpperCase();
  const amountMinor = Number(intent.amount_received ?? intent.amount ?? 0);
  const metadata = metadataRecord(intent.metadata);
  if (intent.id) metadata.stripe_payment_intent_id = intent.id;

  const charge =
    intent.latest_charge && typeof intent.latest_charge === "object"
      ? intent.latest_charge
      : null;
  const feeMinor = feeMinorFromCharge(charge);

  const cusId = stripeCustomerId(intent.customer ?? null);
  const pmId = stripePaymentMethodId(intent.payment_method ?? null);
  if (cusId) metadata.stripe_customer_id = cusId;
  if (pmId) metadata.stripe_payment_method_id = pmId;

  await processSuccessfulPayment(
    buildChargePayload({
      reference,
      metadata,
      amountMinor,
      feeMinor,
      currency,
      customerEmail: intent.receipt_email ?? null,
      stripeCustomerId: cusId,
      stripePaymentMethodId: pmId,
    }),
    supabase,
    { paymentProvider: "stripe" },
  );
}

export async function settleStripePaymentIntentFailed(
  intent: StripePaymentIntentLike,
  supabase: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const reference = resolveReference(intent);
  if (!reference) return;

  const metadata = metadataRecord(intent.metadata);
  const { processFailedPayment } = await import(
    "@/app/api/payments/webhook/_handlers/charge-success"
  );
  await processFailedPayment(
    {
      reference,
      metadata,
      message: intent.last_payment_error?.message ?? "payment_intent.payment_failed",
      gateway_response: intent.last_payment_error?.message ?? undefined,
      __paymentProvider: "stripe",
    },
    supabase,
  );
}
