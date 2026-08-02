import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import { normalizePaycloudMajorAmount } from "@/lib/payments/paycloud-cloud-amount";

/** Provider-collected card-machine rails that share settle/reverse semantics. */
export type CardMachinePaymentProvider = "paycloud" | "yoco";

export type CardMachineEntityType =
  | "booking"
  | "group_booking"
  | "sale"
  | "product_order"
  | "additional_charge";

export interface SettleCardMachinePaymentInput {
  paymentProvider: CardMachinePaymentProvider;
  paymentId: string;
  providerId: string;
  entityType: CardMachineEntityType;
  entityId: string;
  /** Captured amount in major units (may include tip + cashback extras). */
  amount: number;
  /** Stable gateway payment id used as booking_payments.payment_provider_id base. */
  providerPaymentId: string;
  /** Human/merchant reference for payment_provider_data (PayCloud merchant_order_no, etc.). */
  merchantReference?: string | null;
  processedBy?: string | null;
  currency?: string;
  tipAmount?: number | null;
  /** PayCloud cashback (cash-out). Not used for Yoco. Does not bump booking totals. */
  cashbackAmount?: number | null;
  /** PayCloud expected base charge (excludes tip/cashback) for capture allocation. */
  expectedBaseAmount?: number | null;
}

export interface ReverseCardMachineSettlementInput {
  paymentProvider: CardMachinePaymentProvider;
  entityType: CardMachineEntityType;
  entityId: string;
  providerId: string;
  origProviderPaymentId: string;
  voidReference: string;
  processedBy?: string | null;
  /** When set, records a partial reversal (terminal REFUND) instead of full void. */
  refundAmount?: number | null;
  reversalKind?: "void" | "refund";
}

type AdditionalChargeRow = {
  id: string;
  amount?: number | null;
  status?: string | null;
  description?: string | null;
  currency?: string | null;
};

const PROVIDER_LABEL: Record<CardMachinePaymentProvider, string> = {
  paycloud: "Beautonomi card machine",
  yoco: "Yoco card machine",
};

function computeBaseRemaining(booking: {
  total_amount?: number | null;
  total_paid?: number | null;
  total_refunded?: number | null;
  wallet_amount?: number | null;
  gift_card_amount?: number | null;
}): number {
  const bookingTotal = Number(booking.total_amount ?? 0);
  const totalPaid = Number(booking.total_paid ?? 0);
  const totalRefunded = Number(booking.total_refunded ?? 0);
  const walletAmount = Number(booking.wallet_amount ?? 0);
  const giftCardAmount = Number(booking.gift_card_amount ?? 0);
  const effectivePaid = Math.max(0, totalPaid - totalRefunded);
  const walletGiftCoverage = walletAmount + giftCardAmount;
  const coverage = Math.max(effectivePaid, walletGiftCoverage);
  return Math.max(0, bookingTotal - coverage);
}

/**
 * Split PayCloud captured total into base vs tip/cashback for booking ledger rows.
 * PayCloud may report paid_amount as base-only or base+extras; never double-count tips.
 */
export function allocateBaseFromCapture(params: {
  captured: number;
  baseRemaining: number;
  tip: number;
  cashback: number;
  /** Initiated base charge (excludes tip/cashback) from provider_paycloud_payments.expected_amount. */
  expectedBase?: number | null;
}): number {
  const captured = Math.max(0, Number(params.captured) || 0);
  const baseRemaining = Math.max(0, Number(params.baseRemaining) || 0);
  const tip = Math.max(0, Number(params.tip) || 0);
  const cashback = Math.max(0, Number(params.cashback) || 0);
  const extras = tip + cashback;
  const expectedBase =
    params.expectedBase != null && params.expectedBase > 0.01
      ? normalizePaycloudMajorAmount(params.expectedBase)
      : null;

  if (extras <= 0.01) {
    return Math.min(captured, baseRemaining);
  }

  if (
    expectedBase != null &&
    Math.abs(captured - (expectedBase + extras)) < 0.02
  ) {
    return Math.min(baseRemaining, expectedBase);
  }

  if (Math.abs(captured - (baseRemaining + extras)) < 0.02) {
    return Math.min(baseRemaining, Math.max(0, captured - extras));
  }

  if (captured > baseRemaining + 0.01) {
    return Math.min(baseRemaining, Math.max(0, captured - extras));
  }

  return Math.min(captured, baseRemaining);
}

function unpaidChargeRows(booking: { additional_charges?: AdditionalChargeRow[] | null }): AdditionalChargeRow[] {
  if (!Array.isArray(booking.additional_charges)) return [];
  return booking.additional_charges.filter(
    (c) => c?.status !== "paid" && c?.status !== "rejected" && Boolean(c?.id),
  );
}

function paymentSuffixRank(providerPaymentId: string): number {
  const id = String(providerPaymentId ?? "");
  if (id.endsWith(":cashback")) return 2;
  if (id.endsWith(":tip")) return 1;
  return 0;
}

async function settleCardMachineTip(
  supabase: SupabaseClient,
  params: {
    paymentProvider: CardMachinePaymentProvider;
    bookingId: string;
    tenantId: string | null;
    tip: number;
    providerPaymentId: string;
    merchantReference?: string | null;
    paymentId: string;
    processedBy?: string | null;
  },
): Promise<void> {
  const tip = Math.round(params.tip * 100) / 100;
  if (tip <= 0) return;

  const { error } = await supabase.from("booking_payments").insert({
    booking_id: params.bookingId,
    tenant_id: params.tenantId,
    amount: tip,
    payment_method: "card",
    payment_provider: params.paymentProvider,
    payment_provider_id: `${params.providerPaymentId}:tip`,
    payment_provider_data: {
      [`${params.paymentProvider}_payment_id`]: params.providerPaymentId,
      merchant_reference: params.merchantReference ?? null,
      ...(params.paymentProvider === "paycloud"
        ? { merchant_order_no: params.merchantReference ?? null }
        : {}),
      payment_id: params.paymentId,
      tip: true,
    },
    status: "completed",
    notes: `${PROVIDER_LABEL[params.paymentProvider]} tip - ${params.providerPaymentId}`,
    created_by: params.processedBy ?? null,
  });
  if (error) {
    if (error.code === "23505") return;
    throw error;
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("tip_amount, total_amount")
    .eq("id", params.bookingId)
    .maybeSingle();
  if (!booking) return;

  await supabase
    .from("bookings")
    .update({
      tip_amount: Number(booking.tip_amount ?? 0) + tip,
      total_amount: Number(booking.total_amount ?? 0) + tip,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.bookingId);
}

/**
 * Record card-machine cashback as its own payment + finance_transactions.cashback row.
 * Cashback is a cash-out wash — do NOT bump bookings.total_amount / tip_amount.
 */
async function settleCardMachineCashback(
  supabase: SupabaseClient,
  params: {
    paymentProvider: CardMachinePaymentProvider;
    bookingId: string;
    tenantId: string | null;
    cashback: number;
    providerPaymentId: string;
    merchantReference?: string | null;
    paymentId: string;
    processedBy?: string | null;
  },
): Promise<void> {
  const cashback = Math.round(params.cashback * 100) / 100;
  if (cashback <= 0) return;
  // Yoco has no cashback rail today.
  if (params.paymentProvider !== "paycloud") return;

  const { error } = await supabase.from("booking_payments").insert({
    booking_id: params.bookingId,
    tenant_id: params.tenantId,
    amount: cashback,
    payment_method: "card",
    payment_provider: params.paymentProvider,
    payment_provider_id: `${params.providerPaymentId}:cashback`,
    payment_provider_data: {
      paycloud_payment_id: params.providerPaymentId,
      merchant_reference: params.merchantReference ?? null,
      merchant_order_no: params.merchantReference ?? null,
      payment_id: params.paymentId,
      cashback: true,
    },
    status: "completed",
    notes: `${PROVIDER_LABEL[params.paymentProvider]} cashback - ${params.providerPaymentId}`,
    created_by: params.processedBy ?? null,
  });
  if (error) {
    if (error.code === "23505") return;
    throw error;
  }
}

async function settleUnpaidAdditionalCharges(
  paymentProvider: CardMachinePaymentProvider,
  bookingId: string,
  providerId: string,
  tenantId: string | null,
  charges: AdditionalChargeRow[],
  providerPaymentId: string,
  processedBy: string | null | undefined,
): Promise<void> {
  if (!charges.length) return;
  const admin = getSupabaseAdmin();
  for (const charge of charges) {
    if (!charge.id) continue;
    const chargeRef = `${providerPaymentId}:charge:${charge.id}`;
    const { error } = await admin.rpc("record_walk_in_additional_charge_payment", {
      p_booking_id: bookingId,
      p_charge_id: charge.id,
      p_provider_id: providerId,
      p_tenant_id: tenantId,
      p_payment_provider: paymentProvider,
      p_payment_method: "card",
      p_reference: chargeRef,
      p_created_by: processedBy ?? null,
    });
    if (error) {
      throw new Error(error.message || `Failed to settle additional charge ${charge.id}`);
    }
  }
}

/**
 * Settle a successful card-machine capture into Beautonomi finance records.
 * Relies on DB triggers for finance_transactions — never inserts FT here.
 */
export async function settleCardMachinePayment(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
): Promise<{ settled: boolean; reason?: string; bookingId?: string }> {
  const providerPaymentId = input.providerPaymentId;

  switch (input.entityType) {
    case "booking":
      return settleBookingPayment(supabase, input, providerPaymentId);
    case "group_booking":
      return settleGroupBookingPayment(supabase, input, providerPaymentId);
    case "sale":
      return settleSalePayment(supabase, input, providerPaymentId);
    case "product_order":
      return settleProductOrderPayment(supabase, input, providerPaymentId);
    case "additional_charge":
      return settleAdditionalChargePayment(supabase, input, providerPaymentId);
    default:
      return { settled: false, reason: `Unsupported entity type: ${input.entityType}` };
  }
}

async function settleExtrasAfterBase(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
  params: {
    bookingId: string;
    tenantId: string | null;
    providerPaymentId: string;
    baseFullySettled: boolean;
  },
): Promise<void> {
  if (!params.baseFullySettled) return;

  const tip = Math.max(0, Number(input.tipAmount ?? 0));
  if (tip > 0) {
    await settleCardMachineTip(supabase, {
      paymentProvider: input.paymentProvider,
      bookingId: params.bookingId,
      tenantId: params.tenantId,
      tip,
      providerPaymentId: params.providerPaymentId,
      merchantReference: input.merchantReference,
      paymentId: input.paymentId,
      processedBy: input.processedBy,
    });
  }

  const cashback = Math.max(0, Number(input.cashbackAmount ?? 0));
  if (cashback > 0) {
    await settleCardMachineCashback(supabase, {
      paymentProvider: input.paymentProvider,
      bookingId: params.bookingId,
      tenantId: params.tenantId,
      cashback,
      providerPaymentId: params.providerPaymentId,
      merchantReference: input.merchantReference,
      paymentId: input.paymentId,
      processedBy: input.processedBy,
    });
  }
}

async function settleBookingPayment(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string; bookingId?: string }> {
  const bookingId = input.entityId;

  const { data: existing } = await supabase
    .from("booking_payments")
    .select("id")
    .eq("payment_provider", input.paymentProvider)
    .eq("payment_provider_id", providerPaymentId)
    .maybeSingle();
  if (existing) {
    return { settled: true, reason: "already_settled", bookingId };
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, payment_status, tenant_id, status, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, additional_charges(id, amount, status, description, currency)",
    )
    .eq("id", bookingId)
    .eq("provider_id", input.providerId)
    .maybeSingle();

  if (!booking) return { settled: false, reason: "booking_not_found" };
  if (booking.status === "cancelled" || booking.status === "no_show") {
    return { settled: false, reason: "booking_not_collectible" };
  }

  const baseRemaining = computeBaseRemaining(booking);
  const chargeRows = unpaidChargeRows(booking as { additional_charges?: AdditionalChargeRow[] });

  if (baseRemaining <= 0 && chargeRows.length === 0) {
    return { settled: true, reason: "already_paid", bookingId };
  }

  const tip = Math.max(0, Number(input.tipAmount ?? 0));
  const cashback = Math.max(0, Number(input.cashbackAmount ?? 0));

  let basePaymentInserted = false;
  let basePaymentAmount = 0;
  if (baseRemaining > 0) {
    const paymentAmount = allocateBaseFromCapture({
      captured: input.amount,
      baseRemaining,
      tip,
      cashback,
      expectedBase: input.expectedBaseAmount,
    });
    basePaymentAmount = paymentAmount;
    const { error } = await supabase.from("booking_payments").insert({
      booking_id: bookingId,
      tenant_id: booking.tenant_id,
      amount: paymentAmount,
      payment_method: "card",
      payment_provider: input.paymentProvider,
      payment_provider_id: providerPaymentId,
      payment_provider_data: {
        [`${input.paymentProvider}_payment_id`]: providerPaymentId,
        merchant_reference: input.merchantReference ?? null,
        ...(input.paymentProvider === "paycloud"
          ? { merchant_order_no: input.merchantReference ?? null }
          : {}),
        payment_id: input.paymentId,
      },
      status: "completed",
      notes: `${PROVIDER_LABEL[input.paymentProvider]} payment - ${providerPaymentId}`,
      created_by: input.processedBy ?? null,
    });

    if (error) {
      if (error.code === "23505") return { settled: true, reason: "concurrent_insert", bookingId };
      throw error;
    }
    basePaymentInserted = true;
  }

  const baseFullySettled =
    baseRemaining <= 0 ||
    (basePaymentInserted && basePaymentAmount >= baseRemaining - 0.01);

  if (baseFullySettled && chargeRows.length > 0) {
    await settleUnpaidAdditionalCharges(
      input.paymentProvider,
      bookingId,
      input.providerId,
      booking.tenant_id,
      chargeRows,
      providerPaymentId,
      input.processedBy,
    );
  }

  await settleExtrasAfterBase(supabase, input, {
    bookingId,
    tenantId: booking.tenant_id,
    providerPaymentId,
    baseFullySettled,
  });

  return { settled: true, bookingId };
}

async function settleGroupBookingPayment(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string }> {
  const groupId = input.entityId;

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, tenant_id, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount, status, additional_charges(id, amount, status, description, currency)",
    )
    .eq("group_booking_id", groupId)
    .eq("provider_id", input.providerId)
    .not("status", "in", "(cancelled,no_show)");

  if (!bookings?.length) return { settled: false, reason: "no_child_bookings" };

  const tip = Math.max(0, Number(input.tipAmount ?? 0));
  const cashback = Math.max(0, Number(input.cashbackAmount ?? 0));
  const baseBudget = Math.max(0, input.amount - tip - cashback);

  const rows: Record<string, unknown>[] = [];
  const addonSettlements: {
    bookingId: string;
    tenantId: string | null;
    charges: AdditionalChargeRow[];
  }[] = [];

  let remainingBudget = baseBudget;

  for (const booking of bookings) {
    const baseRemaining = computeBaseRemaining(booking);
    const chargeRows = unpaidChargeRows(booking as { additional_charges?: AdditionalChargeRow[] });

    if (baseRemaining > 0 && remainingBudget > 0) {
      const alloc = Math.min(baseRemaining, remainingBudget);
      rows.push({
        booking_id: booking.id,
        tenant_id: booking.tenant_id,
        amount: alloc,
        payment_method: "card",
        payment_provider: input.paymentProvider,
        payment_provider_id: `${providerPaymentId}:${booking.id}`,
        payment_provider_data: {
          [`${input.paymentProvider}_payment_id`]: providerPaymentId,
          merchant_reference: input.merchantReference ?? null,
          group_booking_id: groupId,
        },
        status: "completed",
        notes: `${PROVIDER_LABEL[input.paymentProvider]} group payment - ${providerPaymentId}`,
        created_by: input.processedBy ?? null,
      });
      remainingBudget = Math.round((remainingBudget - alloc) * 100) / 100;

      if (chargeRows.length > 0 && alloc >= baseRemaining - 0.01) {
        addonSettlements.push({
          bookingId: booking.id,
          tenantId: booking.tenant_id,
          charges: chargeRows,
        });
      }
    } else if (chargeRows.length > 0 && baseRemaining <= 0) {
      addonSettlements.push({
        bookingId: booking.id,
        tenantId: booking.tenant_id,
        charges: chargeRows,
      });
    }
  }

  if (!rows.length && !addonSettlements.length) {
    return { settled: true, reason: "group_already_paid" };
  }

  if (rows.length) {
    const { error } = await supabase.from("booking_payments").insert(rows);
    if (error) {
      if (error.code === "23505") return { settled: true, reason: "concurrent_insert" };
      throw error;
    }
  }

  for (const item of addonSettlements) {
    await settleUnpaidAdditionalCharges(
      input.paymentProvider,
      item.bookingId,
      input.providerId,
      item.tenantId,
      item.charges,
      providerPaymentId,
      input.processedBy,
    );
  }

  const primary = bookings[0];
  const baseFullyAllocated = remainingBudget <= 0.01;
  if (primary && baseFullyAllocated) {
    await settleExtrasAfterBase(supabase, input, {
      bookingId: primary.id,
      tenantId: primary.tenant_id,
      providerPaymentId,
      baseFullySettled: true,
    });
  }

  return { settled: true };
}

async function settleSalePayment(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string }> {
  const { error } = await supabase
    .from("sales")
    .update({
      payment_status: "completed",
      payment_provider: input.paymentProvider,
      payment_provider_id: providerPaymentId,
      payment_method: input.paymentProvider === "yoco" ? "yoco" : "card",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.entityId)
    .eq("provider_id", input.providerId);

  if (error) throw error;
  return { settled: true };
}

async function settleProductOrderPayment(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string }> {
  const admin = getSupabaseAdmin();
  const result = await recordProductOrderPayment({
    supabase: admin,
    productOrderId: input.entityId,
    reference: providerPaymentId,
    amountMajor: input.amount,
    source: input.paymentProvider === "yoco" ? "yoco_terminal" : "paycloud_terminal",
    provider: input.paymentProvider,
    platformHeld: false,
  });
  if (!result.ok) return { settled: false, reason: "product_order_record_failed" };

  const { data: order } = await (admin.from("product_orders") as any)
    .select("id, order_source, status, provider_id")
    .eq("id", input.entityId)
    .maybeSingle();
  if (
    order &&
    String(order.order_source ?? "") === "walk_in" &&
    String(order.status ?? "") !== "delivered"
  ) {
    const { fulfillWalkInProductOrderDelivery } = await import(
      "@/lib/provider-sales/fulfill-walk-in-product-order-delivery"
    );
    const delivery = await fulfillWalkInProductOrderDelivery({
      supabase: admin,
      providerId: String(order.provider_id ?? input.providerId),
      orderId: input.entityId,
    });
    if (delivery.ok === false) {
      console.error("[settle-card-machine] walk-in delivery failed:", delivery.reason);
    }
  }

  return { settled: true };
}

async function settleAdditionalChargePayment(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string; bookingId?: string }> {
  const admin = getSupabaseAdmin();
  const { data: charge } = await admin
    .from("additional_charges")
    .select("id, booking_id, amount, status, bookings!inner(provider_id, tenant_id)")
    .eq("id", input.entityId)
    .maybeSingle();

  if (!charge) return { settled: false, reason: "charge_not_found" };
  const booking = (charge as { bookings?: { provider_id?: string; tenant_id?: string | null } }).bookings;
  if (!booking || booking.provider_id !== input.providerId) {
    return { settled: false, reason: "charge_not_found" };
  }
  if (charge.status === "paid" || charge.status === "rejected") {
    return { settled: true, reason: "already_paid", bookingId: charge.booking_id };
  }

  const chargeRef = `${providerPaymentId}:charge:${charge.id}`;
  const { data: existing } = await supabase
    .from("booking_payments")
    .select("id")
    .eq("payment_provider", input.paymentProvider)
    .eq("payment_provider_id", chargeRef)
    .maybeSingle();
  if (existing) return { settled: true, reason: "already_settled", bookingId: charge.booking_id };

  const { error } = await admin.rpc("record_walk_in_additional_charge_payment", {
    p_booking_id: charge.booking_id,
    p_charge_id: charge.id,
    p_provider_id: input.providerId,
    p_tenant_id: booking.tenant_id ?? null,
    p_payment_provider: input.paymentProvider,
    p_payment_method: "card",
    p_reference: chargeRef,
    p_created_by: input.processedBy ?? null,
  });

  if (error) throw new Error(error.message || "Failed to settle additional charge");

  await settleExtrasAfterBase(supabase, input, {
    bookingId: charge.booking_id,
    tenantId: booking.tenant_id ?? null,
    providerPaymentId,
    baseFullySettled: true,
  });

  return { settled: true, bookingId: charge.booking_id };
}

/**
 * Reverse a previously-settled card-machine capture after void/refund.
 * Never settles a void as income.
 */
export async function reverseCardMachineSettlement(
  supabase: SupabaseClient,
  input: ReverseCardMachineSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  switch (input.entityType) {
    case "booking":
    case "group_booking":
    case "additional_charge":
      return reverseBookingCardMachinePayments(supabase, input);
    case "sale":
      return reverseSaleCardMachinePayment(supabase, input);
    case "product_order":
      return reverseProductOrderCardMachinePayment(supabase, input);
    default:
      return { reversed: false, reason: `unsupported_${input.entityType}` };
  }
}

async function reverseBookingCardMachinePayments(
  supabase: SupabaseClient,
  input: ReverseCardMachineSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  if (!input.origProviderPaymentId) return { reversed: false, reason: "missing_original_reference" };

  const { data: payments } = await supabase
    .from("booking_payments")
    .select("id, booking_id, amount, status, payment_provider_id, payment_provider_data")
    .eq("payment_provider", input.paymentProvider)
    .like("payment_provider_id", `${input.origProviderPaymentId}%`);

  const rows = (payments ?? []).filter(
    (p) => p.status === "completed" || p.status === "partially_refunded",
  );
  if (!rows.length) return { reversed: false, reason: "no_original_payment" };

  const sortedRows = [...rows].sort((a, b) => {
    const aRank = paymentSuffixRank(String((a as { payment_provider_id?: string }).payment_provider_id ?? ""));
    const bRank = paymentSuffixRank(String((b as { payment_provider_id?: string }).payment_provider_id ?? ""));
    return aRank - bRank;
  });

  const tipRowsToUnbump: Array<{ bookingId: string; amount: number }> = [];
  const reversalKind = input.reversalKind ?? "void";
  const partialCap =
    input.refundAmount != null && input.refundAmount > 0 ? Number(input.refundAmount) : null;

  for (const p of sortedRows) {
    const providerPaymentId = String((p as { payment_provider_id?: string }).payment_provider_id ?? "");
    const isTipRow = providerPaymentId.endsWith(":tip");
    const isCashbackRow = providerPaymentId.endsWith(":cashback");
    if (partialCap != null && (isTipRow || isCashbackRow)) continue;

    const { data: existingRefund } = await supabase
      .from("booking_refunds")
      .select("id")
      .eq("payment_id", p.id)
      .eq("refund_provider_id", input.voidReference)
      .maybeSingle();
    if (existingRefund) continue;

    const rowAmount = Number(p.amount ?? 0);
    const refundInsertAmount =
      partialCap != null ? Math.min(rowAmount, partialCap) : rowAmount;
    if (refundInsertAmount <= 0) continue;

    const { error } = await supabase.from("booking_refunds").insert({
      booking_id: p.booking_id,
      payment_id: p.id,
      amount: refundInsertAmount,
      reason:
        reversalKind === "refund"
          ? `${input.paymentProvider}_refund`
          : `${input.paymentProvider}_void`,
      refund_method: "original",
      refund_provider_id: input.voidReference,
      status: "completed",
      notes: `${PROVIDER_LABEL[input.paymentProvider]} ${reversalKind} of ${input.origProviderPaymentId}`,
      created_by: input.processedBy ?? null,
    });
    if (error && error.code !== "23505") throw error;

    if (!error) {
      const nextStatus =
        partialCap != null && refundInsertAmount + 0.01 < rowAmount
          ? "partially_refunded"
          : "refunded";
      await supabase
        .from("booking_payments")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", p.id);
    }

    if (isTipRow && !error) {
      tipRowsToUnbump.push({
        bookingId: p.booking_id,
        amount: Number(p.amount ?? 0),
      });
    }

    if (partialCap != null) break;
  }

  for (const tip of tipRowsToUnbump) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("tip_amount, total_amount")
      .eq("id", tip.bookingId)
      .maybeSingle();
    if (booking) {
      await supabase
        .from("bookings")
        .update({
          tip_amount: Math.max(0, Number(booking.tip_amount ?? 0) - tip.amount),
          total_amount: Math.max(0, Number(booking.total_amount ?? 0) - tip.amount),
          updated_at: new Date().toISOString(),
        })
        .eq("id", tip.bookingId);
    }
  }

  return { reversed: true };
}

async function reverseProductOrderCardMachinePayment(
  supabase: SupabaseClient,
  input: ReverseCardMachineSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  if (!input.origProviderPaymentId) {
    return { reversed: false, reason: "missing_original_reference" };
  }

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from("product_orders")
    .select("id, payment_status, payment_reference, provider_id, total_amount, wallet_amount, status")
    .eq("id", input.entityId)
    .eq("provider_id", input.providerId)
    .maybeSingle();

  if (!order) return { reversed: false, reason: "order_not_found" };
  if (order.payment_status !== "paid" && order.payment_status !== "partially_refunded") {
    return { reversed: true, reason: "already_unpaid" };
  }

  if (
    order.payment_reference &&
    order.payment_reference !== input.origProviderPaymentId
  ) {
    return { reversed: false, reason: "reference_mismatch" };
  }

  const { data: paymentTx } = await admin
    .from("payment_transactions")
    .select("amount, status")
    .eq("provider", input.paymentProvider)
    .eq("reference", input.origProviderPaymentId)
    .maybeSingle();

  const collectibleTotal = Math.max(
    0,
    Number(order.total_amount ?? 0) - Number(order.wallet_amount ?? 0),
  );
  const paidAmount = Math.max(0, Number(paymentTx?.amount ?? collectibleTotal));
  const refundAmount =
    input.refundAmount != null && input.refundAmount > 0 ? Number(input.refundAmount) : paidAmount;
  const isFullRefund = refundAmount + 0.01 >= paidAmount;

  const orderUpdate: Record<string, unknown> = {
    payment_status: isFullRefund ? "refunded" : "partially_refunded",
    updated_at: new Date().toISOString(),
  };
  if (isFullRefund) {
    orderUpdate.status = "refunded";
  }

  const { error: orderErr } = await admin
    .from("product_orders")
    .update(orderUpdate)
    .eq("id", input.entityId)
    .eq("provider_id", input.providerId);

  if (orderErr) throw orderErr;

  await admin
    .from("payment_transactions")
    .update({
      status: isFullRefund ? "refunded" : "partially_refunded",
      updated_at: new Date().toISOString(),
    })
    .eq("provider", input.paymentProvider)
    .eq("reference", input.origProviderPaymentId);

  return { reversed: true };
}

async function reverseSaleCardMachinePayment(
  supabase: SupabaseClient,
  input: ReverseCardMachineSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  const { error } = await supabase
    .from("sales")
    .update({
      payment_status: "refunded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.entityId)
    .eq("provider_id", input.providerId)
    .eq("payment_provider", input.paymentProvider);
  if (error) throw error;
  return { reversed: true };
}
