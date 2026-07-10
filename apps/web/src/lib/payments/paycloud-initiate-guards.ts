import type { SupabaseClient } from "@supabase/supabase-js";

const COLLECTIBLE_ENTITY_TYPES = new Set([
  "booking",
  "group_booking",
  "sale",
  "product_order",
  "additional_charge",
]);

// Flat shape (not a discriminated union) because the web tsconfig runs with
// `strictNullChecks: false`, under which TS will not narrow a union on a boolean
// discriminant — callers must be able to read code/message/status after `if (!guard.ok)`.
export interface PaycloudInitiateGuardResult {
  ok: boolean;
  code?: string;
  message?: string;
  status?: number;
  existingPaymentId?: string;
}

/**
 * P0 money-safety checks before creating a PayCloud order.
 */
export async function validatePaycloudPaymentInitiate(
  supabase: SupabaseClient,
  params: {
    providerId: string;
    terminalId: string;
    entityType: string;
    entityId: string;
    environment: string;
  },
): Promise<PaycloudInitiateGuardResult> {
  if (!COLLECTIBLE_ENTITY_TYPES.has(params.entityType)) {
    return { ok: false, code: "INVALID_ENTITY", message: "This item can't be charged on a card machine.", status: 400 };
  }

  const { data: terminal } = await supabase
    .from("paycloud_terminals")
    .select("id, status, is_active, in_flight_payment_id, paycloud_merchant_id, provider_id")
    .eq("id", params.terminalId)
    .eq("provider_id", params.providerId)
    .maybeSingle();

  if (!terminal) {
    return { ok: false, code: "TERMINAL_NOT_FOUND", message: "Card machine not found.", status: 404 };
  }
  if (!terminal.is_active || terminal.status === "suspended" || terminal.status === "decommissioned") {
    return { ok: false, code: "TERMINAL_UNAVAILABLE", message: "This card machine is not available.", status: 400 };
  }
  if (terminal.in_flight_payment_id) {
    return {
      ok: false,
      code: "TERMINAL_IN_FLIGHT",
      message: "This card machine already has a payment in progress. Wait or cancel it first.",
      status: 409,
      existingPaymentId: terminal.in_flight_payment_id,
    };
  }

  if (terminal.paycloud_merchant_id) {
    const { data: merchant } = await supabase
      .from("paycloud_merchants")
      .select("environment, is_active")
      .eq("id", terminal.paycloud_merchant_id)
      .maybeSingle();
    if (!merchant?.is_active) {
      return {
        ok: false,
        code: "MERCHANT_INACTIVE",
        message: "Card machine account isn't ready yet. Contact support if this continues.",
        status: 400,
      };
    }
    if (merchant.environment && merchant.environment !== params.environment) {
      return {
        ok: false,
        code: "ENV_MISMATCH",
        message: "This card machine is set up for a different mode (test vs live).",
        status: 400,
      };
    }
  }

  const { data: pendingSameEntity } = await supabase
    .from("provider_paycloud_payments")
    .select("id")
    .eq("provider_id", params.providerId)
    .eq("entity_type", params.entityType)
    .eq("entity_id", params.entityId)
    .in("status", ["pending", "processing"])
    .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();

  if (pendingSameEntity) {
    return {
      ok: false,
      code: "ENTITY_IN_FLIGHT",
      message: "A payment is already in progress for this item.",
      status: 409,
      existingPaymentId: pendingSameEntity.id,
    };
  }

  if (params.entityType === "booking") {
    const { data: booking } = await supabase
      .from("bookings")
      .select("status, payment_status, additional_charges(status)")
      .eq("id", params.entityId)
      .eq("provider_id", params.providerId)
      .maybeSingle();
    if (!booking) return { ok: false, code: "BOOKING_NOT_FOUND", message: "Booking not found.", status: 404 };
    if (booking.status === "cancelled" || booking.status === "no_show") {
      return { ok: false, code: "BOOKING_NOT_COLLECTIBLE", message: "This booking cannot be charged.", status: 400 };
    }
    const hasUnpaidCharges = Array.isArray((booking as any).additional_charges)
      ? (booking as any).additional_charges.some(
          (c: { status?: string }) => c?.status !== "paid" && c?.status !== "rejected",
        )
      : false;
    if (booking.payment_status === "paid" && !hasUnpaidCharges) {
      return { ok: false, code: "ALREADY_PAID", message: "Booking is already paid.", status: 400 };
    }
  }

  if (params.entityType === "sale") {
    const { data: sale } = await supabase
      .from("sales")
      .select("payment_status")
      .eq("id", params.entityId)
      .eq("provider_id", params.providerId)
      .maybeSingle();
    if (!sale) return { ok: false, code: "SALE_NOT_FOUND", message: "Sale not found.", status: 404 };
    if (sale.payment_status === "completed") {
      return { ok: false, code: "ALREADY_PAID", message: "Sale is already paid.", status: 400 };
    }
  }

  if (params.entityType === "group_booking") {
    const { data: children } = await supabase
      .from("bookings")
      .select("id, status, payment_status, additional_charges(status)")
      .eq("group_booking_id", params.entityId)
      .eq("provider_id", params.providerId);
    const collectible = (children ?? []).filter((b) => {
      if (b.status === "cancelled" || b.status === "no_show") return false;
      const hasUnpaidCharges = Array.isArray((b as any).additional_charges)
        ? (b as any).additional_charges.some(
            (c: { status?: string }) => c?.status !== "paid" && c?.status !== "rejected",
          )
        : false;
      return b.payment_status !== "paid" || hasUnpaidCharges;
    });
    if (!collectible.length) {
      return { ok: false, code: "GROUP_ALREADY_PAID", message: "Group booking is already paid.", status: 400 };
    }
  }

  if (params.entityType === "product_order") {
    const { data: order } = await supabase
      .from("product_orders")
      .select("payment_status, status, order_source")
      .eq("id", params.entityId)
      .eq("provider_id", params.providerId)
      .maybeSingle();
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND", message: "Order not found.", status: 404 };
    if (order.order_source === "appointment") {
      return {
        ok: false,
        code: "ORDER_NOT_COLLECTIBLE",
        message: "This order is paid on the appointment — charge the booking instead.",
        status: 400,
      };
    }
    if (order.payment_status === "paid") {
      return { ok: false, code: "ALREADY_PAID", message: "Order is already paid.", status: 400 };
    }
    if (order.status === "cancelled" || order.status === "refunded") {
      return { ok: false, code: "ORDER_NOT_COLLECTIBLE", message: "This order cannot be charged.", status: 400 };
    }
  }

  if (params.entityType === "additional_charge") {
    const { data: charge } = await supabase
      .from("additional_charges")
      .select("status, bookings!inner(provider_id)")
      .eq("id", params.entityId)
      .maybeSingle();
    if (!charge) return { ok: false, code: "CHARGE_NOT_FOUND", message: "Additional charge not found.", status: 404 };
    const booking = (charge as any).bookings;
    if (!booking || booking.provider_id !== params.providerId) {
      return { ok: false, code: "CHARGE_NOT_FOUND", message: "Additional charge not found.", status: 404 };
    }
    if (charge.status === "paid") {
      return { ok: false, code: "ALREADY_PAID", message: "This charge is already paid.", status: 400 };
    }
    if (charge.status === "rejected") {
      return { ok: false, code: "CHARGE_NOT_COLLECTIBLE", message: "This charge was rejected.", status: 400 };
    }
  }

  return { ok: true };
}
