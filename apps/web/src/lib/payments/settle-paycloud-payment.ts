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

  const rows: Record<string, unknown>[] = [];
  const addonSettlements: {
    bookingId: string;
    tenantId: string | null;
    charges: AdditionalChargeRow[];
  }[] = [];

  for (const booking of bookings) {
    const baseRemaining = computeBaseRemaining(booking);
    const chargeRows = unpaidChargeRows(booking as { additional_charges?: AdditionalChargeRow[] });

    if (baseRemaining > 0) {
      rows.push({
        booking_id: booking.id,
        tenant_id: booking.tenant_id,
        amount: baseRemaining,
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
    }

    if (chargeRows.length > 0) {
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
  return { settled: true, bookingId: charge.booking_id };
}
