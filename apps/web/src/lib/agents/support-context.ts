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
