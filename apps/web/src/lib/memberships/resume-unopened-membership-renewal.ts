import type { SupabaseClient } from "@supabase/supabase-js";
import { membershipExpiresStillOpen, renewalPeriodEnd } from "@/lib/memberships/membership-renewal-retry";

async function successPaymentForRenewalOrder(
  supabase: SupabaseClient,
  orderId: string,
): Promise<{ reference: string | null } | null> {
  const { data, error } = await supabase
    .from("payment_transactions")
    .select("id, reference")
    .eq("status", "success")
    .contains("metadata", { membership_order_id: orderId })
    .limit(1);
  if (error) throw error;
  const row = (data?.[0] ?? null) as { reference?: string | null } | null;
  return row ? { reference: row.reference ?? null } : null;
}

async function markRenewalOrderPaid(
  supabase: SupabaseClient,
  orderId: string,
  reference: string | null,
  nowIso: string,
): Promise<void> {
  const { error } = await supabase
    .from("membership_orders")
    .update({
      status: "paid",
      ...(reference ? { paystack_reference: reference } : {}),
      updated_at: nowIso,
    })
    .eq("id", orderId);
  if (error) throw error;
}

/**
 * A renewal charge that was saved can still leave the membership on the old
 * end date. The next run opens that month from the saved payment. It does not
 * charge the card again.
 */
export async function resumeUnopenedMembershipRenewal(input: {
  supabase: SupabaseClient;
  membershipId: string;
  userId: string;
  providerId: string;
  planId: string;
  expiresAt: string | null;
  metadata: Record<string, unknown> | null;
  now: Date;
}): Promise<"opened" | "unchanged"> {
  const appliedOrderId =
    typeof input.metadata?.membership_order_id === "string"
      ? input.metadata.membership_order_id
      : null;

  const { data: latestRows, error: orderError } = await input.supabase
    .from("membership_orders")
    .select("id, status")
    .eq("user_id", input.userId)
    .eq("provider_id", input.providerId)
    .eq("plan_id", input.planId)
    .contains("metadata", { source: "auto_renewal", membership_id: input.membershipId })
    .in("status", ["paid", "pending", "failed"])
    .order("created_at", { ascending: false })
    .limit(5);
  if (orderError) throw orderError;
  const orders = (latestRows ?? []) as Array<{ id: string; status?: string | null }>;
  const nowIso = input.now.toISOString();
  const applied = orders.find((order) => order.id === appliedOrderId) ?? null;
  let stampedApplied = false;
  if (applied && String(applied.status ?? "").toLowerCase() !== "paid") {
    const appliedPayment = await successPaymentForRenewalOrder(input.supabase, applied.id);
    if (appliedPayment) {
      await markRenewalOrderPaid(input.supabase, applied.id, appliedPayment.reference, nowIso);
      stampedApplied = true;
    }
  }

  let saved: { id: string; status?: string | null; reference: string | null } | null = null;
  for (const order of orders) {
    if (order.id === appliedOrderId) {
      if (
        stampedApplied &&
        input.expiresAt &&
        membershipExpiresStillOpen(input.expiresAt, input.now)
      ) {
        const { error: billError } = await input.supabase
          .from("user_memberships")
          .update({
            next_billing_at: input.expiresAt,
            updated_at: nowIso,
          })
          .eq("id", input.membershipId);
        if (billError) throw billError;
        return "opened";
      }
      return "unchanged";
    }
    const payment = await successPaymentForRenewalOrder(input.supabase, order.id);
    if (!payment) continue;
    saved = { id: order.id, status: order.status, reference: payment.reference };
    break;
  }
  if (!saved) return "unchanged";

  const periodEnd = renewalPeriodEnd(input.expiresAt, input.now);
  const priorMeta =
    input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const { error: termError } = await input.supabase
    .from("user_memberships")
    .update({
      status: "active",
      expires_at: periodEnd.toISOString(),
      next_billing_at: periodEnd.toISOString(),
      last_payment_at: nowIso,
      renewal_failure_count: 0,
      past_due_since: null,
      metadata: {
        ...priorMeta,
        source: "auto_renewal",
        membership_order_id: saved.id,
      },
      updated_at: nowIso,
    })
    .eq("id", input.membershipId);
  if (termError) throw termError;

  if (saved.status !== "paid") {
    const { error: paidError } = await input.supabase
      .from("membership_orders")
      .update({
        status: "paid",
        ...(saved.reference ? { paystack_reference: saved.reference } : {}),
        updated_at: nowIso,
      })
      .eq("id", saved.id);
    if (paidError) throw paidError;
  }

  return "opened";
}

/**
 * A payment can be saved and the month opened while the order row stays
 * pending. The next run marks that order paid. It does not move the end date
 * and it does not mark an order whose month is still closed.
 */
export async function stampOpenedMembershipOrders(
  supabase: SupabaseClient,
  now: Date,
  limit = 100,
): Promise<number> {
  const { data, error } = await supabase
    .from("membership_orders")
    .select("id")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const nowIso = now.toISOString();
  let stamped = 0;
  for (const row of (data ?? []) as Array<{ id: string }>) {
    const payment = await successPaymentForRenewalOrder(supabase, row.id);
    if (!payment) continue;
    const { data: memberships, error: membershipError } = await supabase
      .from("user_memberships")
      .select("id, expires_at, next_billing_at")
      .contains("metadata", { membership_order_id: row.id })
      .limit(1);
    if (membershipError) throw membershipError;
    const membership = (memberships?.[0] ?? null) as {
      expires_at?: string | null;
      next_billing_at?: string | null;
    } | null;
    if (!membership) continue;
    const monthOpen =
      Boolean(membership.expires_at) &&
      membershipExpiresStillOpen(membership.expires_at as string, now);
    const billingDue =
      Boolean(membership.next_billing_at) &&
      new Date(membership.next_billing_at as string).getTime() <= now.getTime();
    if (monthOpen && billingDue) continue;
    await markRenewalOrderPaid(supabase, row.id, payment.reference, nowIso);
    stamped += 1;
  }
  return stamped;
}
