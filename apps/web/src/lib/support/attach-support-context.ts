import type { SupabaseClient } from "@supabase/supabase-js";
import { ticketOwnsSupportRecord } from "@/lib/agents/support-context";

export type AttachSupportContextInput = {
  booking_number?: string | null;
  order_number?: string | null;
  gift_card_code?: string | null;
  booking_id?: string | null;
  order_id?: string | null;
  gift_card_id?: string | null;
};

export type AttachSupportContextResult =
  | {
      ok: true;
      support_context_type: string;
      support_context_id: string;
      support_context_label: string;
    }
  | { ok: false; code: string; message: string };

export async function attachSupportContextToTicket(params: {
  admin: SupabaseClient;
  ticketId: string;
  ticket: { user_id: string; provider_id?: string | null };
  input: AttachSupportContextInput;
}): Promise<AttachSupportContextResult> {
  const bookingNumber = String(params.input.booking_number ?? "").trim();
  const orderNumber = String(params.input.order_number ?? "").trim();
  const giftCode = String(params.input.gift_card_code ?? "").trim();
  const bookingId = String(params.input.booking_id ?? "").trim();
  const orderId = String(params.input.order_id ?? "").trim();
  const giftCardId = String(params.input.gift_card_id ?? "").trim();

  let contextType: string | null = null;
  let contextId: string | null = null;
  let contextLabel: string | null = null;

  if (bookingId) {
    const { data: booking } = await params.admin
      .from("bookings")
      .select("id, booking_number, customer_id, provider_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (
      !booking ||
      !ticketOwnsSupportRecord({
        ticketUserId: params.ticket.user_id,
        ticketProviderId: params.ticket.provider_id,
        recordCustomerId: booking.customer_id,
        recordProviderId: booking.provider_id,
      })
    ) {
      return { ok: false, code: "FORBIDDEN", message: "Booking not found for this requester" };
    }
    contextType = "booking";
    contextId = booking.id;
    contextLabel = String(booking.booking_number ?? booking.id);
  } else if (bookingNumber) {
    const { data: booking } = await params.admin
      .from("bookings")
      .select("id, booking_number, customer_id, provider_id")
      .ilike("booking_number", bookingNumber)
      .limit(1)
      .maybeSingle();
    if (
      !booking ||
      !ticketOwnsSupportRecord({
        ticketUserId: params.ticket.user_id,
        ticketProviderId: params.ticket.provider_id,
        recordCustomerId: booking.customer_id,
        recordProviderId: booking.provider_id,
      })
    ) {
      return { ok: false, code: "FORBIDDEN", message: "Booking not found for this requester" };
    }
    contextType = "booking";
    contextId = booking.id;
    contextLabel = String(booking.booking_number ?? booking.id);
  } else if (orderId) {
    const { data: order } = await params.admin
      .from("product_orders")
      .select("id, order_number, customer_id, provider_id")
      .eq("id", orderId)
      .maybeSingle();
    if (
      !order ||
      !ticketOwnsSupportRecord({
        ticketUserId: params.ticket.user_id,
        ticketProviderId: params.ticket.provider_id,
        recordCustomerId: order.customer_id,
        recordProviderId: order.provider_id,
      })
    ) {
      return { ok: false, code: "FORBIDDEN", message: "Order not found for this requester" };
    }
    contextType = "product_order";
    contextId = order.id;
    contextLabel = String(order.order_number ?? order.id);
  } else if (orderNumber) {
    const { data: order } = await params.admin
      .from("product_orders")
      .select("id, order_number, customer_id, provider_id")
      .ilike("order_number", orderNumber)
      .limit(1)
      .maybeSingle();
    if (
      !order ||
      !ticketOwnsSupportRecord({
        ticketUserId: params.ticket.user_id,
        ticketProviderId: params.ticket.provider_id,
        recordCustomerId: order.customer_id,
        recordProviderId: order.provider_id,
      })
    ) {
      return { ok: false, code: "FORBIDDEN", message: "Order not found for this requester" };
    }
    contextType = "product_order";
    contextId = order.id;
    contextLabel = String(order.order_number ?? order.id);
  } else if (giftCardId) {
    const { data: card } = await params.admin.from("gift_cards").select("id, code").eq("id", giftCardId).maybeSingle();
    if (!card) {
      return { ok: false, code: "NOT_FOUND", message: "Gift card not found" };
    }
    contextType = "gift_card";
    contextId = card.id;
    contextLabel = card.code?.slice(-4) ? `••••${card.code.slice(-4)}` : card.id;
  } else if (giftCode) {
    const { data: card } = await params.admin
      .from("gift_cards")
      .select("id, code")
      .ilike("code", giftCode)
      .limit(1)
      .maybeSingle();
    if (!card) {
      return { ok: false, code: "NOT_FOUND", message: "Gift card not found" };
    }
    contextType = "gift_card";
    contextId = card.id;
    contextLabel = card.code?.slice(-4) ? `••••${card.code.slice(-4)}` : card.id;
  } else {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Provide booking_number, order_number, gift_card_code, or a record id",
    };
  }

  const { error } = await params.admin
    .from("support_tickets")
    .update({
      support_context_type: contextType,
      support_context_id: contextId,
      support_context_label: contextLabel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.ticketId);

  if (error) {
    return { ok: false, code: "UPDATE_FAILED", message: error.message };
  }

  return {
    ok: true,
    support_context_type: contextType,
    support_context_id: contextId,
    support_context_label: contextLabel,
  };
}
