import type { SupabaseClient } from "@supabase/supabase-js";
import { isAppleBillingActive } from "@/lib/iap/apple/billing-active";
import {
  effectiveInvoiceStatus,
  invoiceAmountDue,
  isOpenInvoiceStatus,
  isProviderInvoicePayable,
} from "@/lib/invoices/provider-invoice-status";
import { todayUtcYmd } from "@/lib/invoices/provider-invoices-query";
import { getAvailablePayoutBalance } from "@/lib/provider/available-payout-balance";

export type ObligationPayAction =
  | "invoice_pay"
  | "subscription_pay"
  | "stripe_manage"
  | "apple_manage"
  | "terminal_pay"
  | "payout_offset"
  | "none";

export type ObligationStatus = "due" | "paid" | "refunded";

export type ProviderBillingObligation = {
  id: string;
  kind: string;
  status: ObligationStatus;
  title: string;
  description?: string | null;
  amount: number;
  currency: string;
  pay_action: ObligationPayAction;
  entity_id?: string | null;
  occurred_at?: string | null;
  refund_review_required?: boolean;
};

export type ProviderBillingObligationsResult = {
  obligations: ProviderBillingObligation[];
  outstanding_total: number;
  due_count: number;
};

const TERMINAL_CLOSED_STATUSES = new Set(["cancelled", "refunded", "failed"]);

function subscriptionPayAction(billingProvider?: string | null): ObligationPayAction {
  if (billingProvider === "stripe") return "stripe_manage";
  if (billingProvider === "apple") return "apple_manage";
  return "subscription_pay";
}

type SubscriptionRow = {
  id: string;
  status?: string | null;
  billing_provider?: string | null;
  paystack_sync_pending?: boolean | null;
  paystack_sync_note?: string | null;
  apple_price_increase_status?: string | null;
  plan_id?: string | null;
  plan?: { name?: string | null; is_free?: boolean | null; currency?: string | null; price_monthly?: number | null } | null;
};

type OrderRow = {
  id: string;
  plan_id?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  failure_reason?: string | null;
};

function resolveSubscriptionDue(
  sub: SubscriptionRow,
  order: OrderRow | null,
): ProviderBillingObligation | null {
  const currency = String(sub.plan?.currency ?? order?.currency ?? "ZAR");
  const planName = String(sub.plan?.name ?? "Subscription");
  const currentPlanIsFree = sub.plan?.is_free === true;

  const hasCleanActivePaidPlan =
    !currentPlanIsFree && sub.status === "active" && !sub.paystack_sync_pending;
  const effectiveOrder =
    hasCleanActivePaidPlan && order?.plan_id === sub.plan_id ? null : order;

  const checkoutIssueOnFree =
    currentPlanIsFree &&
    (effectiveOrder?.status === "pending" || effectiveOrder?.status === "failed");

  let due = false;
  let title = planName;
  let description: string | null = null;
  let amount = Number(effectiveOrder?.amount ?? sub.plan?.price_monthly ?? 0);

  if (checkoutIssueOnFree) {
    due = true;
    description =
      effectiveOrder?.status === "failed"
        ? effectiveOrder.failure_reason?.trim() ||
          "Subscription payment was not completed."
        : "Complete subscription checkout to activate the selected plan.";
  } else if (!currentPlanIsFree) {
    if (
      isAppleBillingActive(sub.billing_provider, sub.status) &&
      sub.apple_price_increase_status === "pending"
    ) {
      due = true;
      description =
        "Accept the Apple price increase in Apple ID → Subscriptions to keep renewing.";
    } else if (sub.status === "past_due") {
      due = true;
      description =
        sub.billing_provider === "apple"
          ? "Apple could not renew this plan. Update payment on your Apple ID."
          : "Your last subscription payment did not go through.";
    } else if (sub.paystack_sync_pending) {
      due = true;
      description =
        sub.paystack_sync_note?.trim() ||
        "Plan changed but billing still needs to be confirmed.";
    } else if (effectiveOrder?.status === "failed") {
      due = true;
      description =
        effectiveOrder.failure_reason?.trim() ||
        "Your subscription payment was not completed.";
    } else if (effectiveOrder?.status === "pending") {
      due = true;
      description = "Subscription checkout is still pending.";
    }
  }

  if (!due) return null;

  return {
    id: `subscription:${sub.id}`,
    kind: "subscription",
    status: "due",
    title,
    description,
    amount: Math.max(0, amount),
    currency,
    pay_action: subscriptionPayAction(sub.billing_provider),
    entity_id: sub.id,
  };
}

export async function buildProviderBillingObligations(
  supabase: SupabaseClient,
  providerId: string,
  options?: { today?: string; includeReceipts?: boolean },
): Promise<ProviderBillingObligationsResult> {
  const today = options?.today ?? todayUtcYmd();
  const includeReceipts = options?.includeReceipts !== false;
  const obligations: ProviderBillingObligation[] = [];

  const { data: providerRow } = await supabase
    .from("providers")
    .select("currency")
    .eq("id", providerId)
    .maybeSingle();
  const defaultCurrency = String((providerRow as { currency?: string } | null)?.currency ?? "ZAR");

  const { data: subscription } = await supabase
    .from("provider_subscriptions")
    .select(
      "id, status, billing_provider, paystack_sync_pending, paystack_sync_note, apple_price_increase_status, plan_id, plan:subscription_plans!plan_id(name, is_free, currency, price_monthly)",
    )
    .eq("provider_id", providerId)
    .maybeSingle();

  if (subscription) {
    const { data: latestOrder } = await supabase
      .from("provider_subscription_orders")
      .select("id, plan_id, amount, currency, status, failure_reason")
      .eq("provider_id", providerId)
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const subDue = resolveSubscriptionDue(
      subscription as SubscriptionRow,
      (latestOrder as OrderRow | null) ?? null,
    );
    if (subDue) obligations.push(subDue);
  }

  const { data: openInvoices } = await supabase
    .from("provider_invoices")
    .select(
      "id, invoice_number, invoice_type, status, due_date, total_amount, amount_paid, amount_due, currency, metadata",
    )
    .eq("provider_id", providerId)
    .in("status", ["sent", "partially_paid", "overdue"]);

  for (const row of openInvoices ?? []) {
    const inv = row as Record<string, unknown>;
    if (!isProviderInvoicePayable(inv as { invoice_type?: string; status?: string })) {
      continue;
    }
    const effective = effectiveInvoiceStatus(inv as any, today);
    const due = invoiceAmountDue(inv as any);
    if (!isOpenInvoiceStatus(effective) || due <= 0) continue;

    obligations.push({
      id: `invoice:${String(inv.id)}`,
      kind: "provider_invoice",
      status: "due",
      title: String(inv.invoice_number ?? "Invoice"),
      description: String(inv.invoice_type ?? "").replace(/_/g, " "),
      amount: due,
      currency: String(inv.currency ?? defaultCurrency),
      pay_action: "invoice_pay",
      entity_id: String(inv.id),
    });
  }

  const { data: terminalOrders } = await supabase
    .from("terminal_orders")
    .select("id, order_status, invoice_status, total_amount, currency, commercial_model")
    .eq("provider_id", providerId)
    .in("invoice_status", ["pending", "issued"]);

  for (const row of terminalOrders ?? []) {
    const order = row as Record<string, unknown>;
    const orderStatus = String(order.order_status ?? "");
    if (TERMINAL_CLOSED_STATUSES.has(orderStatus)) continue;
    const total = Number(order.total_amount ?? 0);
    if (total <= 0) continue;
    if (order.commercial_model === "subscription_bundle") continue;

    obligations.push({
      id: `terminal_order:${String(order.id)}`,
      kind: "terminal_order",
      status: "due",
      title: "Card machine order",
      amount: total,
      currency: String(order.currency ?? defaultCurrency),
      pay_action: "terminal_pay",
      entity_id: String(order.id),
    });
  }

  try {
    const payout = await getAvailablePayoutBalance(supabase, providerId);
    if (payout.hasNegativeBalance && payout.rawBalance < 0) {
      obligations.push({
        id: `payout_offset:${providerId}`,
        kind: "payout_shortfall",
        status: "due",
        title: "Balance owed to platform",
        description: "Recovered from future payouts — not payable by card.",
        amount: Math.abs(payout.rawBalance),
        currency: defaultCurrency,
        pay_action: "payout_offset",
        entity_id: providerId,
      });
    }
  } catch {
    // Payout ledger unavailable — omit offset row rather than failing the whole payload.
  }

  if (includeReceipts) {
    const { data: receipts } = await supabase
      .from("provider_billing_activity")
      .select("id, type, amount, currency, status, description, occurred_at, direction")
      .eq("provider_id", providerId)
      .order("occurred_at", { ascending: false })
      .limit(20);

    for (const row of receipts ?? []) {
      const r = row as Record<string, unknown>;
      const direction = String(r.direction ?? "");
      obligations.push({
        id: `receipt:${String(r.id)}`,
        kind: String(r.type ?? "billing_receipt"),
        status: direction === "refund" ? "refunded" : "paid",
        title: String(r.description ?? r.type ?? "Payment"),
        amount: Math.abs(Number(r.amount ?? 0)),
        currency: String(r.currency ?? defaultCurrency),
        pay_action: "none",
        entity_id: String(r.id),
        occurred_at: String(r.occurred_at ?? ""),
      });
    }
  }

  const dueRows = obligations.filter((o) => o.status === "due");
  const outstanding_total = dueRows
    .filter((o) => o.pay_action !== "payout_offset")
    .reduce((sum, o) => sum + o.amount, 0);

  return {
    obligations,
    outstanding_total: Math.round(outstanding_total * 100) / 100,
    due_count: dueRows.length,
  };
}
