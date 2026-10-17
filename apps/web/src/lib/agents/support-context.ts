/**
 * Context enrichment for the support triage agent.
 *
 * Tickets carry support_context_type/support_context_id (booking, product
 * order, gift card, payment). Fetching a compact, ownership-verified fact
 * sheet lets the agent draft replies like "your booking on Friday was
 * refunded on the 12th" instead of a generic acknowledgement.
 *
 * Safety: facts are only returned when the object verifiably belongs to the
 * ticket requester (except gift cards, where only non-identifying balance
 * facts are exposed). Values are primitives only — no free-form PII.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type SupportTicketContextFacts = {
  contextType: string;
  facts: Record<string, string | number | boolean | null>;
};

export function ticketOwnsSupportRecord(input: {
  ticketUserId: string;
  ticketProviderId?: string | null;
  recordCustomerId?: string | null;
  recordProviderId?: string | null;
}): boolean {
  if (input.recordCustomerId && input.recordCustomerId === input.ticketUserId) return true;
  if (input.ticketProviderId && input.recordProviderId && input.recordProviderId === input.ticketProviderId) {
    return true;
  }
  return false;
}

export async function fetchSupportTicketContext(
  supabase: SupabaseClient,
  ticket: {
    user_id: string;
    provider_id?: string | null;
    support_context_type?: string | null;
    support_context_id?: string | null;
  },
): Promise<SupportTicketContextFacts | null> {
  const type = ticket.support_context_type;
  const id = ticket.support_context_id;
  if (!type || !id) return null;

  try {
    if (type === "booking") {
      const { data: booking } = await supabase
        .from("bookings")
        .select(
          "id, booking_number, customer_id, status, scheduled_at, completed_at, cancelled_at, cancellation_reason, total_amount, total_paid, total_refunded, currency, payment_status, provider_id",
        )
        .eq("id", id)
        .maybeSingle();
      if (
        !booking ||
        !ticketOwnsSupportRecord({
          ticketUserId: ticket.user_id,
          ticketProviderId: ticket.provider_id,
          recordCustomerId: booking.customer_id,
          recordProviderId: booking.provider_id,
        })
      ) {
        return null;
      }

      const { data: provider } = await supabase
        .from("providers")
        .select("business_name")
        .eq("id", booking.provider_id)
        .maybeSingle();
      const { data: refunds } = await supabase
        .from("booking_refunds")
        .select("amount, status, refund_method, created_at")
        .eq("booking_id", id)
        .order("created_at", { ascending: false })
        .limit(3);

      return {
        contextType: "booking",
        facts: {
          booking_number: booking.booking_number ?? null,
          provider_name: (provider as { business_name?: string } | null)?.business_name ?? null,
          status: booking.status ?? null,
          scheduled_at: booking.scheduled_at ?? null,
          completed_at: booking.completed_at ?? null,
          cancelled_at: booking.cancelled_at ?? null,
          cancellation_reason: booking.cancellation_reason ?? null,
          total_amount: Number(booking.total_amount ?? 0),
          total_paid: Number(booking.total_paid ?? 0),
          total_refunded: Number(booking.total_refunded ?? 0),
          currency: booking.currency ?? null,
          payment_status: booking.payment_status ?? null,
          recent_refunds: (refunds ?? [])
            .map((r) => `${r.status} ${r.refund_method ?? "original"} refund of ${Number(r.amount).toFixed(2)}`)
            .join("; ") || null,
        },
      };
    }

    if (type === "product_order") {
      const { data: order } = await supabase
        .from("product_orders")
        .select(
          "id, order_number, customer_id, provider_id, status, fulfillment_type, total_amount, currency, payment_status, tracking_number, estimated_delivery_date, shipped_at, delivered_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (
        !order ||
        !ticketOwnsSupportRecord({
          ticketUserId: ticket.user_id,
          ticketProviderId: ticket.provider_id,
          recordCustomerId: order.customer_id,
          recordProviderId: order.provider_id,
        })
      ) {
        return null;
      }
      return {
        contextType: "product_order",
        facts: {
          order_number: order.order_number ?? null,
          status: order.status ?? null,
          fulfillment_type: order.fulfillment_type ?? null,
          total_amount: Number(order.total_amount ?? 0),
          currency: order.currency ?? null,
          payment_status: order.payment_status ?? null,
          tracking_number: order.tracking_number ?? null,
          estimated_delivery_date: order.estimated_delivery_date ?? null,
          shipped_at: order.shipped_at ?? null,
          delivered_at: order.delivered_at ?? null,
        },
      };
    }

    if (type === "gift_card") {
      const { data: card } = await supabase
        .from("gift_cards")
        .select("id, code, balance, initial_balance, currency, is_active, expires_at")
        .eq("id", id)
        .maybeSingle();
      if (!card) return null;
      const code = String(card.code ?? "");
      return {
        contextType: "gift_card",
        facts: {
          code_last4: code.length >= 4 ? `••••${code.slice(-4)}` : null,
          balance: Number(card.balance ?? 0),
          initial_balance: Number(card.initial_balance ?? 0),
          currency: card.currency ?? null,
          is_active: Boolean(card.is_active),
          expires_at: card.expires_at ?? null,
        },
      };
    }

    if (type === "wallet_bank_refund") {
      const { data: req } = await supabase
        .from("wallet_bank_refund_requests")
        .select(
          "id, request_number, user_id, status, amount, net_amount, currency, bank_name, account_number_last4, tenant_id",
        )
        .eq("id", id)
        .maybeSingle();
      if (!req || req.user_id !== ticket.user_id) return null;
      let slaDays: number | null = null;
      try {
        const { getEffectiveWalletBankRefundSettings } = await import("@/lib/wallet-bank-refunds/settings");
        const settings = await getEffectiveWalletBankRefundSettings(supabase, String(req.tenant_id ?? ""));
        slaDays = settings.sla_business_days;
      } catch {
        slaDays = 5;
      }
      return {
        contextType: "wallet_bank_refund",
        facts: {
          request_number: req.request_number ?? null,
          status: req.status ?? null,
          amount: Number(req.amount ?? 0),
          net_amount: Number(req.net_amount ?? 0),
          currency: req.currency ?? null,
          bank_name: req.bank_name ?? null,
          bank_last4: req.account_number_last4 ?? null,
          sla_business_days: slaDays,
        },
      };
    }

    if (type === "payment") {
      const { data: payment } = await supabase
        .from("booking_payments")
        .select("id, booking_id, amount, payment_method, payment_provider, status, created_at")
        .eq("id", id)
        .maybeSingle();
      if (!payment) return null;
      const { data: booking } = await supabase
        .from("bookings")
        .select("customer_id, provider_id, booking_number")
        .eq("id", payment.booking_id)
        .maybeSingle();
      if (
        !booking ||
        !ticketOwnsSupportRecord({
          ticketUserId: ticket.user_id,
          ticketProviderId: ticket.provider_id,
          recordCustomerId: booking.customer_id,
          recordProviderId: booking.provider_id,
        })
      ) {
        return null;
      }
      return {
        contextType: "payment",
        facts: {
          booking_number: booking.booking_number ?? null,
          amount: Number(payment.amount ?? 0),
          payment_method: payment.payment_method ?? null,
          payment_provider: payment.payment_provider ?? null,
          status: payment.status ?? null,
          paid_at: payment.created_at ?? null,
        },
      };
    }
  } catch {
    // Context is best-effort — a fetch failure must never block triage.
  }
  return null;
}

export type RecentSupportRecordSummary = {
  kind: "booking" | "product_order";
  id: string;
  label: string;
  status: string | null;
  at: string | null;
};

/** Ownership-scoped recent records when the ticket has no linked id yet. */
export async function listRequesterRecentSupportRecords(
  supabase: SupabaseClient,
  ticket: { user_id: string; provider_id?: string | null },
  limit = 5,
): Promise<RecentSupportRecordSummary[]> {
  const out: RecentSupportRecordSummary[] = [];
  try {
    if (ticket.provider_id) {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, booking_number, status, scheduled_at, provider_id")
        .eq("provider_id", ticket.provider_id)
        .order("scheduled_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      for (const b of bookings ?? []) {
        out.push({
          kind: "booking",
          id: String(b.id),
          label: String(b.booking_number ?? b.id),
          status: (b.status as string) ?? null,
          at: (b.scheduled_at as string) ?? null,
        });
      }
    } else {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, booking_number, status, scheduled_at, customer_id")
        .eq("customer_id", ticket.user_id)
        .order("scheduled_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      for (const b of bookings ?? []) {
        out.push({
          kind: "booking",
          id: String(b.id),
          label: String(b.booking_number ?? b.id),
          status: (b.status as string) ?? null,
          at: (b.scheduled_at as string) ?? null,
        });
      }
      const { data: orders } = await supabase
        .from("product_orders")
        .select("id, order_number, status, created_at, customer_id")
        .eq("customer_id", ticket.user_id)
        .order("created_at", { ascending: false })
        .limit(limit);
      for (const o of orders ?? []) {
        out.push({
          kind: "product_order",
          id: String(o.id),
          label: String(o.order_number ?? o.id),
          status: (o.status as string) ?? null,
          at: (o.created_at as string) ?? null,
        });
      }
    }
  } catch {
    return out;
  }
  return out.slice(0, limit * 2);
}

/** Admin attach UI: recent records or ilike search on booking/order numbers (requester-owned). */
export async function searchRequesterSupportContextRecords(
  supabase: SupabaseClient,
  ticket: { user_id: string; provider_id?: string | null },
  query: string,
  limit = 8,
): Promise<RecentSupportRecordSummary[]> {
  const q = query.trim();
  if (!q) {
    return listRequesterRecentSupportRecords(supabase, ticket, limit);
  }
  const pattern = `%${q.replace(/%/g, "")}%`;
  const out: RecentSupportRecordSummary[] = [];
  try {
    if (ticket.provider_id) {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, booking_number, status, scheduled_at, provider_id, customer_id")
        .eq("provider_id", ticket.provider_id)
        .ilike("booking_number", pattern)
        .order("scheduled_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      for (const b of bookings ?? []) {
        if (
          !ticketOwnsSupportRecord({
            ticketUserId: ticket.user_id,
            ticketProviderId: ticket.provider_id,
            recordCustomerId: b.customer_id as string | null,
            recordProviderId: b.provider_id as string | null,
          })
        ) {
          continue;
        }
        out.push({
          kind: "booking",
          id: String(b.id),
          label: String(b.booking_number ?? b.id),
          status: (b.status as string) ?? null,
          at: (b.scheduled_at as string) ?? null,
        });
      }
      const { data: orders } = await supabase
        .from("product_orders")
        .select("id, order_number, status, created_at, provider_id, customer_id")
        .eq("provider_id", ticket.provider_id)
        .ilike("order_number", pattern)
        .order("created_at", { ascending: false })
        .limit(limit);
      for (const o of orders ?? []) {
        if (
          !ticketOwnsSupportRecord({
            ticketUserId: ticket.user_id,
            ticketProviderId: ticket.provider_id,
            recordCustomerId: o.customer_id as string | null,
            recordProviderId: o.provider_id as string | null,
          })
        ) {
          continue;
        }
        out.push({
          kind: "product_order",
          id: String(o.id),
          label: String(o.order_number ?? o.id),
          status: (o.status as string) ?? null,
          at: (o.created_at as string) ?? null,
        });
      }
    } else {
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, booking_number, status, scheduled_at, customer_id, provider_id")
        .eq("customer_id", ticket.user_id)
        .ilike("booking_number", pattern)
        .order("scheduled_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      for (const b of bookings ?? []) {
        out.push({
          kind: "booking",
          id: String(b.id),
          label: String(b.booking_number ?? b.id),
          status: (b.status as string) ?? null,
          at: (b.scheduled_at as string) ?? null,
        });
      }
      const { data: orders } = await supabase
        .from("product_orders")
        .select("id, order_number, status, created_at, customer_id, provider_id")
        .eq("customer_id", ticket.user_id)
        .ilike("order_number", pattern)
        .order("created_at", { ascending: false })
        .limit(limit);
      for (const o of orders ?? []) {
        out.push({
          kind: "product_order",
          id: String(o.id),
          label: String(o.order_number ?? o.id),
          status: (o.status as string) ?? null,
          at: (o.created_at as string) ?? null,
        });
      }
    }
  } catch {
    return out.slice(0, limit);
  }
  return out.slice(0, limit);
}
