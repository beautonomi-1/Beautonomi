import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";

export type PaycloudEntityType =
  | "booking"
  | "group_booking"
  | "sale"
  | "product_order"
  | "additional_charge";

export interface SettlePaycloudPaymentInput {
  paymentId: string;
  providerId: string;
  entityType: PaycloudEntityType;
  entityId: string;
  amount: number;
  paycloudOrderId: string;
  merchantOrderNo: string;
  processedBy?: string | null;
  currency?: string;
  /** Tip requested at capture time (major units). Recorded onto the booking's
   *  tip_amount/total_amount so tips collected on the card machine appear in
   *  receipts and reports instead of being silently dropped. */
  tipAmount?: number | null;
}

type AdditionalChargeRow = {
  id: string;
  amount?: number | null;
  status?: string | null;
  description?: string | null;
  currency?: string | null;
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

function unpaidChargeRows(booking: { additional_charges?: AdditionalChargeRow[] | null }): AdditionalChargeRow[] {
  if (!Array.isArray(booking.additional_charges)) return [];
  return booking.additional_charges.filter(
    (c) => c?.status !== "paid" && c?.status !== "rejected" && Boolean(c?.id),
  );
}

/**
 * Record a card-machine tip against a booking as its own payment row plus a
 * bookings.tip_amount / total_amount bump (booking totals include tip — see
 * migration 583). Insert-first ordering makes the unique
 * (payment_provider, payment_provider_id) index the idempotency gate: on a
 * concurrent webhook/reconcile race the second insert hits 23505 and skips the
 * bump, so the tip can never double-count.
 */
async function settleCardMachineTip(
  supabase: SupabaseClient,
  params: {
    bookingId: string;
    tenantId: string | null;
    tip: number;
    providerPaymentId: string;
    merchantOrderNo: string;
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
    payment_provider: "paycloud",
    payment_provider_id: `${params.providerPaymentId}:tip`,
    payment_provider_data: {
      paycloud_payment_id: params.providerPaymentId,
      merchant_order_no: params.merchantOrderNo,
      payment_id: params.paymentId,
      tip: true,
    },
    status: "completed",
    notes: `Beautonomi card machine tip - ${params.providerPaymentId}`,
    created_by: params.processedBy ?? null,
  });
  if (error) {
    if (error.code === "23505") return; // concurrent settle already recorded the tip
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

async function settleUnpaidAdditionalCharges(
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
      p_payment_provider: "paycloud",
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
 * Settle a successful PayCloud capture into Beautonomi finance records.
 * Relies on DB triggers for finance_transactions — never inserts FT here.
 */
export async function settlePaycloudPayment(
  supabase: SupabaseClient,
  input: SettlePaycloudPaymentInput,
): Promise<{ settled: boolean; reason?: string; bookingId?: string }> {
  const providerPaymentId = input.paycloudOrderId || input.merchantOrderNo;

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

async function settleBookingPayment(
  supabase: SupabaseClient,
  input: SettlePaycloudPaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string; bookingId?: string }> {
  const bookingId = input.entityId;

  const { data: existing } = await supabase
    .from("booking_payments")
    .select("id")
    .eq("payment_provider", "paycloud")
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

  let basePaymentInserted = false;
  if (baseRemaining > 0) {
    const paymentAmount = Math.min(input.amount, baseRemaining);
    const { error } = await supabase.from("booking_payments").insert({
      booking_id: bookingId,
      tenant_id: booking.tenant_id,
      amount: paymentAmount,
      payment_method: "card",
      payment_provider: "paycloud",
      payment_provider_id: providerPaymentId,
      payment_provider_data: {
        paycloud_payment_id: providerPaymentId,
        merchant_order_no: input.merchantOrderNo,
        payment_id: input.paymentId,
      },
      status: "completed",
      notes: `Beautonomi card machine payment - ${providerPaymentId}`,
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
    (basePaymentInserted && Math.min(input.amount, baseRemaining) >= baseRemaining - 0.01);

  if (baseFullySettled && chargeRows.length > 0) {
    await settleUnpaidAdditionalCharges(
      bookingId,
      input.providerId,
      booking.tenant_id,
      chargeRows,
      providerPaymentId,
      input.processedBy,
    );
  }

  // Tips authorized with the capture only apply once the base charge is fully
  // covered (settle only runs on exact/over captures, so this is the norm).
  const tip = Math.max(0, Number(input.tipAmount ?? 0));
  if (tip > 0 && baseFullySettled) {
    await settleCardMachineTip(supabase, {
      bookingId,
      tenantId: booking.tenant_id,
      tip,
      providerPaymentId,
      merchantOrderNo: input.merchantOrderNo,
      paymentId: input.paymentId,
      processedBy: input.processedBy,
    });
  }

  return { settled: true, bookingId };
}

async function settleGroupBookingPayment(
  supabase: SupabaseClient,
  input: SettlePaycloudPaymentInput,
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
  const baseBudget = Math.max(0, input.amount - tip);

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
        payment_provider: "paycloud",
        payment_provider_id: `${providerPaymentId}:${booking.id}`,
        payment_provider_data: {
          paycloud_payment_id: providerPaymentId,
          merchant_order_no: input.merchantOrderNo,
          group_booking_id: groupId,
        },
        status: "completed",
        notes: `Beautonomi card machine group payment - ${providerPaymentId}`,
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
      item.bookingId,
      input.providerId,
      item.tenantId,
      item.charges,
      providerPaymentId,
      input.processedBy,
    );
  }

  // Group captures carry a single tip — record it on the primary (first) child
  // so group rollups (which sum child tip_amounts) surface it.
  const primary = bookings[0];
  const baseFullyAllocated = remainingBudget <= 0.01;
  if (tip > 0 && primary && baseFullyAllocated) {
    await settleCardMachineTip(supabase, {
      bookingId: primary.id,
      tenantId: primary.tenant_id,
      tip,
      providerPaymentId,
      merchantOrderNo: input.merchantOrderNo,
      paymentId: input.paymentId,
      processedBy: input.processedBy,
    });
  }

  return { settled: true };
}

async function settleSalePayment(
  supabase: SupabaseClient,
  input: SettlePaycloudPaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string }> {
  const { error } = await supabase
    .from("sales")
    .update({
      payment_status: "completed",
      payment_provider: "paycloud",
      payment_provider_id: providerPaymentId,
      payment_method: "card",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.entityId)
    .eq("provider_id", input.providerId);

  if (error) throw error;
  return { settled: true };
}

async function settleProductOrderPayment(
  supabase: SupabaseClient,
  input: SettlePaycloudPaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string }> {
  const admin = getSupabaseAdmin();
  const result = await recordProductOrderPayment({
    supabase: admin,
    productOrderId: input.entityId,
    reference: providerPaymentId,
    amountMajor: input.amount,
    source: "paycloud_terminal",
    provider: "paycloud",
    platformHeld: false,
  });
  if (!result.ok) return { settled: false, reason: "product_order_record_failed" };
  return { settled: true };
}

export interface ReversePaycloudSettlementInput {
  entityType: PaycloudEntityType;
  entityId: string;
  providerId: string;
  /** The provider payment id used when the ORIGINAL capture was settled
   *  (original.paycloud_order_id || original.merchant_order_no). */
  origProviderPaymentId: string;
  /** Void payment reference (used as refund_provider_id for idempotency). */
  voidReference: string;
  processedBy?: string | null;
}

/**
 * Reverse a previously-settled PayCloud capture after a successful terminal VOID.
 *
 * A void is NEVER a new positive payment — settling the void row would double-count
 * income. Instead we reverse the original operational records using the platform's
 * existing refund mechanics (booking_refunds → finance/GL reversal triggers), so the
 * ledger, booking totals and reports self-correct.
 */
export async function reversePaycloudSettlement(
  supabase: SupabaseClient,
  input: ReversePaycloudSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  switch (input.entityType) {
    case "booking":
    case "group_booking":
    case "additional_charge":
      return reverseBookingPaycloudPayments(supabase, input);
    case "sale":
      return reverseSalePaycloudPayment(supabase, input);
    case "product_order":
      return reverseProductOrderPaycloudPayment(supabase, input);
    default:
      return { reversed: false, reason: `unsupported_${input.entityType}` };
  }
}

async function reverseBookingPaycloudPayments(
  supabase: SupabaseClient,
  input: ReversePaycloudSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  if (!input.origProviderPaymentId) return { reversed: false, reason: "missing_original_reference" };

  // Base capture uses payment_provider_id === origProviderPaymentId; group children use
  // `${orig}:${bookingId}`, additional charges use `${orig}:charge:${chargeId}` and
  // card-machine tips use `${orig}:tip` — a prefix match reverses all rows that
  // belong to this capture.
  const { data: payments } = await supabase
    .from("booking_payments")
    .select("id, booking_id, amount, status, payment_provider_id")
    .eq("payment_provider", "paycloud")
    .like("payment_provider_id", `${input.origProviderPaymentId}%`);

  const rows = (payments ?? []).filter(
    (p) => p.status === "completed" || p.status === "partially_refunded",
  );
  if (!rows.length) return { reversed: false, reason: "no_original_payment" };

  for (const p of rows) {
    // Idempotency: skip if this void already produced a refund for this payment.
    const { data: existingRefund } = await supabase
      .from("booking_refunds")
      .select("id")
      .eq("payment_id", p.id)
      .eq("refund_provider_id", input.voidReference)
      .maybeSingle();
    if (existingRefund) continue;

    const { error } = await supabase.from("booking_refunds").insert({
      booking_id: p.booking_id,
      payment_id: p.id,
      amount: p.amount,
      reason: "paycloud_void",
      refund_method: "original",
      refund_provider_id: input.voidReference,
      status: "completed",
      notes: `PayCloud card machine void of ${input.origProviderPaymentId}`,
      created_by: input.processedBy ?? null,
    });
    if (error && error.code !== "23505") throw error;

    // Tip rows also bumped bookings.tip_amount/total_amount at settle time —
    // un-bump when the tip payment is reversed so the booking total is honest.
    // Guarded by the refund insert above (skipped on existingRefund), so a
    // webhook/reconcile race cannot double-decrement.
    const isTipRow = String((p as { payment_provider_id?: string }).payment_provider_id ?? "").endsWith(":tip");
    if (isTipRow && !error) {
      const { data: booking } = await supabase
        .from("bookings")
        .select("tip_amount, total_amount")
        .eq("id", p.booking_id)
        .maybeSingle();
      if (booking) {
        const tip = Number(p.amount ?? 0);
        await supabase
          .from("bookings")
          .update({
            tip_amount: Math.max(0, Number(booking.tip_amount ?? 0) - tip),
            total_amount: Math.max(0, Number(booking.total_amount ?? 0) - tip),
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.booking_id);
      }
    }
  }

  return { reversed: true };
}

async function reverseProductOrderPaycloudPayment(
  supabase: SupabaseClient,
  input: ReversePaycloudSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  if (!input.origProviderPaymentId) {
    return { reversed: false, reason: "missing_original_reference" };
  }

  const admin = getSupabaseAdmin();
  const { data: order } = await admin
    .from("product_orders")
    .select("id, payment_status, payment_reference, provider_id")
    .eq("id", input.entityId)
    .eq("provider_id", input.providerId)
    .maybeSingle();

  if (!order) return { reversed: false, reason: "order_not_found" };
  if (order.payment_status !== "paid") {
    return { reversed: true, reason: "already_unpaid" };
  }

  if (
    order.payment_reference &&
    order.payment_reference !== input.origProviderPaymentId
  ) {
    return { reversed: false, reason: "reference_mismatch" };
  }

  const { error: orderErr } = await admin
    .from("product_orders")
    .update({
      payment_status: "refunded",
      status: "refunded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.entityId)
    .eq("provider_id", input.providerId);

  if (orderErr) throw orderErr;

  await admin
    .from("payment_transactions")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("provider", "paycloud")
    .eq("reference", input.origProviderPaymentId);

  return { reversed: true };
}

async function reverseSalePaycloudPayment(
  supabase: SupabaseClient,
  input: ReversePaycloudSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  const { error } = await supabase
    .from("sales")
    .update({
      payment_status: "refunded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.entityId)
    .eq("provider_id", input.providerId)
    .eq("payment_provider", "paycloud");
  if (error) throw error;
  return { reversed: true };
}

async function settleAdditionalChargePayment(
  supabase: SupabaseClient,
  input: SettlePaycloudPaymentInput,
  providerPaymentId: string,
): Promise<{ settled: boolean; reason?: string; bookingId?: string }> {
  const admin = getSupabaseAdmin();
  const { data: charge } = await admin
    .from("additional_charges")
    .select("id, booking_id, amount, status, bookings!inner(provider_id, tenant_id)")
    .eq("id", input.entityId)
    .maybeSingle();

  if (!charge) return { settled: false, reason: "charge_not_found" };
  const booking = (charge as any).bookings;
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
    .eq("payment_provider", "paycloud")
    .eq("payment_provider_id", chargeRef)
    .maybeSingle();
  if (existing) return { settled: true, reason: "already_settled", bookingId: charge.booking_id };

  const { error } = await admin.rpc("record_walk_in_additional_charge_payment", {
    p_booking_id: charge.booking_id,
    p_charge_id: charge.id,
    p_provider_id: input.providerId,
    p_tenant_id: booking.tenant_id ?? null,
    p_payment_provider: "paycloud",
    p_payment_method: "card",
    p_reference: chargeRef,
    p_created_by: input.processedBy ?? null,
  });

  if (error) throw new Error(error.message || "Failed to settle additional charge");

  const tip = Math.max(0, Number(input.tipAmount ?? 0));
  if (tip > 0) {
    await settleCardMachineTip(supabase, {
      bookingId: charge.booking_id,
      tenantId: booking.tenant_id ?? null,
      tip,
      providerPaymentId,
      merchantOrderNo: input.merchantOrderNo,
      paymentId: input.paymentId,
      processedBy: input.processedBy,
    });
  }

  return { settled: true, bookingId: charge.booking_id };
}
