import type { SupabaseClient } from "@supabase/supabase-js";
import { convertToSmallestUnit } from "@/lib/payments/paystack";
import { toMinorUnits } from "@beautonomi/utils";

export type ResolvePaystackAmountResult =
  | { ok: true; amountSmallestUnit: number }
  | { ok: false; status: number; code: string; message: string };

export type ProductOrderCardChargeRow = {
  amount?: number | string | null;
  reference?: string | null;
};

/** Card amount still owed after wallet, gift, and card charges already recorded. */
export function productOrderAmountStillDue(input: {
  total: number;
  wallet: number;
  gift: number;
  priorCardPayments: number;
}): number {
  return Math.max(
    0,
    Math.round((input.total - input.wallet - input.gift - input.priorCardPayments) * 100) / 100,
  );
}

/** A charge is allowed when it matches what is still owed, or this reference was already recorded. */
export function productOrderPaystackChargeIsAllowed(input: {
  total: number;
  wallet: number;
  gift: number;
  priorCardPayments: number;
  amountMajor: number;
  referenceAlreadyRecorded: boolean;
}): boolean {
  if (input.referenceAlreadyRecorded) return true;
  const expected = productOrderAmountStillDue(input);
  return Math.abs(input.amountMajor - expected) <= 0.01;
}

export async function productOrderCardAmountStillDue(
  supabase: SupabaseClient,
  productOrderId: string,
  reference: string,
): Promise<{ ok: true; due: number } | { ok: false; message: string }> {
  const { data: order, error } = await (supabase.from("product_orders") as any)
    .select("total_amount, wallet_amount, gift_card_amount")
    .eq("id", productOrderId)
    .maybeSingle();
  if (error || !order) return { ok: false, message: "Order not found" };
  const recorded = await loadSuccessfulProductOrderCardCharges(supabase, productOrderId);
  if (recorded.ok === false) return { ok: false, message: recorded.message };
  const prior = priorProductOrderCardPayments(recorded.rows, reference);
  return {
    ok: true,
    due: productOrderAmountStillDue({
      total: Number(order.total_amount ?? 0),
      wallet: Number(order.wallet_amount ?? 0),
      gift: Number(order.gift_card_amount ?? 0),
      priorCardPayments: prior.priorCardPayments,
    }),
  };
}

export function priorProductOrderCardPayments(
  rows: ProductOrderCardChargeRow[],
  reference: string,
): { priorCardPayments: number; referenceAlreadyRecorded: boolean } {
  const current = reference.trim();
  let priorCardPayments = 0;
  let referenceAlreadyRecorded = false;
  for (const row of rows) {
    const rowReference = String(row.reference ?? "").trim();
    if (current && rowReference === current) {
      referenceAlreadyRecorded = true;
      continue;
    }
    priorCardPayments += Number(row.amount ?? 0);
  }
  return {
    priorCardPayments: Math.round(priorCardPayments * 100) / 100,
    referenceAlreadyRecorded,
  };
}

export async function loadSuccessfulProductOrderCardCharges(
  supabase: SupabaseClient,
  productOrderId: string,
): Promise<{ ok: true; rows: ProductOrderCardChargeRow[] } | { ok: false; message: string }> {
  try {
    const { data, error } = await (supabase.from("payment_transactions") as any)
      .select("amount, reference")
      .eq("status", "success")
      .filter("metadata->>product_order_id", "eq", productOrderId);
    if (error) return { ok: false, message: error.message ?? "Could not load card payments" };
    return { ok: true, rows: (data ?? []) as ProductOrderCardChargeRow[] };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not load card payments" };
  }
}

export async function resolveProductOrderPaystackAmount(
  supabase: SupabaseClient,
  productOrderId: string,
  userId: string,
): Promise<ResolvePaystackAmountResult> {
  const { data: po, error } = await (supabase.from("product_orders") as any)
    .select(
      "id, customer_id, payment_status, payment_method, status, total_amount, wallet_amount, gift_card_amount, currency",
    )
    .eq("id", productOrderId)
    .maybeSingle();

  if (error || !po) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Order not found" };
  }
  if (po.customer_id !== userId) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "You do not have permission to pay for this order" };
  }
  const orderStatus = String((po as { status?: string | null }).status ?? "").toLowerCase();
  if (orderStatus !== "pending") {
    return {
      ok: false,
      status: 400,
      code: "ORDER_NOT_PAYABLE",
      message: "This order does not require online payment",
    };
  }
  if (po.payment_status !== "pending") {
    return {
      ok: false,
      status: 400,
      code: "ORDER_NOT_PAYABLE",
      message: "This order does not require online payment",
    };
  }

  const total = Number(po.total_amount ?? 0);
  const wallet = Number(po.wallet_amount ?? 0);
  // Gift card reserved at checkout (879) reduces the card amount like wallet does.
  const giftCard = Number(po.gift_card_amount ?? 0);
  const recorded = await loadSuccessfulProductOrderCardCharges(supabase, productOrderId);
  if (recorded.ok === false) {
    return {
      ok: false,
      status: 500,
      code: "PAYMENT_LOOKUP_FAILED",
      message: "Could not confirm what has already been paid on this order",
    };
  }
  const alreadyCollected = priorProductOrderCardPayments(recorded.rows, "").priorCardPayments;
  const dueMajor = productOrderAmountStillDue({
    total,
    wallet,
    gift: giftCard,
    priorCardPayments: alreadyCollected,
  });
  const currency = String((po as { currency?: string }).currency || "ZAR").toUpperCase();
  const amountSmallestUnit = convertToSmallestUnit(dueMajor, currency);

  if (dueMajor > 0 && amountSmallestUnit < toMinorUnits(1, currency)) {
    return {
      ok: false,
      status: 400,
      code: "AMOUNT_TOO_SMALL",
      message: "Amount due is below the minimum allowed for card payment",
    };
  }

  if (dueMajor <= 0) {
    return {
      ok: false,
      status: 400,
      code: "NOTHING_TO_PAY",
      message: "Nothing left to pay on this order",
    };
  }

  return { ok: true, amountSmallestUnit };
}

const ONLINE_CARD_PAYMENT_PROVIDERS = ["paystack", "stripe", "flutterwave"] as const;

export type ResolveBookingPendingAmountResult = ResolvePaystackAmountResult & {
  pendingPaymentId?: string;
  amountMajor?: number;
  currency?: string;
  paymentProvider?: string;
};

/** Server-side pending booking card amount (any online PSP). */
export async function resolveBookingPendingAmount(
  supabase: SupabaseClient,
  bookingId: string,
  userId: string,
): Promise<ResolveBookingPendingAmountResult> {
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, customer_id, payment_status, currency")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Booking not found" };
  }
  const b = booking as { customer_id?: string; payment_status?: string };
  if (b.customer_id !== userId) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: "You do not have permission to pay for this booking" };
  }
  if (b.payment_status === "paid") {
    return {
      ok: false,
      status: 400,
      code: "ALREADY_PAID",
      message: "This booking is already paid",
    };
  }

  const { data: payRow } = await (supabase.from("payments") as any)
    .select("id, amount, status, payment_provider, currency")
    .eq("booking_id", bookingId)
    .eq("user_id", userId)
    .in("payment_provider", [...ONLINE_CARD_PAYMENT_PROVIDERS])
    .eq("status", "pending")
    .or(
      "metadata->>type.is.null,metadata->>type.not.in.(booking_remaining,additional_charge,group_participant_share)",
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const dueMajor = Number((payRow as { amount?: number } | null)?.amount ?? 0);
  if (!payRow || !(dueMajor > 0)) {
    return {
      ok: false,
      status: 400,
      code: "NO_PENDING_PAYMENT",
      message: "No pending card payment found for this booking",
    };
  }

  const currency = String(
    (payRow as { currency?: string }).currency ||
      (booking as { currency?: string }).currency ||
      "ZAR",
  ).toUpperCase();
  const amountSmallestUnit = convertToSmallestUnit(dueMajor, currency);
  if (amountSmallestUnit < toMinorUnits(1, currency)) {
    return {
      ok: false,
      status: 400,
      code: "AMOUNT_TOO_SMALL",
      message: "Amount due is below the minimum allowed for card payment",
    };
  }

  return {
    ok: true,
    amountSmallestUnit,
    pendingPaymentId: String((payRow as { id?: string }).id ?? ""),
    amountMajor: dueMajor,
    currency,
    paymentProvider: String((payRow as { payment_provider?: string }).payment_provider ?? ""),
  };
}

const PRODUCT_ORDER_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Successful card charges already stored, grouped by product order. */
export async function loadSuccessfulProductOrderCardPaidByOrderIds(
  supabase: SupabaseClient,
  orderIds: string[],
): Promise<{ ok: true; paidByOrderId: Map<string, number> } | { ok: false; message: string }> {
  const paidByOrderId = new Map<string, number>();
  const ids = [...new Set(orderIds.filter((id) => PRODUCT_ORDER_ID_SHAPE.test(id)))];
  for (const id of ids) paidByOrderId.set(id, 0);
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const orFilter = chunk.map((id) => `metadata->>product_order_id.eq.${id}`).join(",");
    const { data, error } = await (supabase.from("payment_transactions") as any)
      .select("amount, metadata")
      .eq("status", "success")
      .or(orFilter);
    if (error) return { ok: false, message: error.message ?? "Could not load card payments" };
    for (const row of data ?? []) {
      const orderId = String((row as { metadata?: { product_order_id?: string } }).metadata?.product_order_id ?? "");
      if (!paidByOrderId.has(orderId)) continue;
      paidByOrderId.set(orderId, (paidByOrderId.get(orderId) ?? 0) + Number((row as { amount?: number }).amount ?? 0));
    }
  }
  for (const [id, sum] of paidByOrderId) {
    paidByOrderId.set(id, Math.round(sum * 100) / 100);
  }
  return { ok: true, paidByOrderId };
}

export function amountStillDueForProductOrder(
  order: {
    payment_status?: string | null;
    total_amount?: number | string | null;
    wallet_amount?: number | string | null;
    gift_card_amount?: number | string | null;
  },
  cardPaid: number,
): number {
  const status = String(order.payment_status ?? "").toLowerCase();
  if (status === "paid" || status === "refunded" || status === "partially_refunded") return 0;
  return productOrderAmountStillDue({
    total: Number(order.total_amount ?? 0),
    wallet: Number(order.wallet_amount ?? 0),
    gift: Number(order.gift_card_amount ?? 0),
    priorCardPayments: cardPaid,
  });
}

export async function withProductOrderAmountStillDue<T extends {
  id: string;
  payment_status?: string | null;
  total_amount?: number | string | null;
  wallet_amount?: number | string | null;
  gift_card_amount?: number | string | null;
}>(
  supabase: SupabaseClient,
  orders: T[],
): Promise<Array<T & { amount_still_due: number | null }>> {
  const loaded = await loadSuccessfulProductOrderCardPaidByOrderIds(
    supabase,
    orders.map((order) => order.id),
  );
  if (loaded.ok === false) {
    return orders.map((order) => ({ ...order, amount_still_due: null }));
  }
  return orders.map((order) => ({
    ...order,
    amount_still_due: amountStillDueForProductOrder(order, loaded.paidByOrderId.get(order.id) ?? 0),
  }));
}

/** @deprecated Use resolveBookingPendingAmount */
export async function resolveBookingPaystackAmount(
  supabase: SupabaseClient,
  bookingId: string,
  userId: string,
): Promise<ResolvePaystackAmountResult> {
  return resolveBookingPendingAmount(supabase, bookingId, userId);
}
