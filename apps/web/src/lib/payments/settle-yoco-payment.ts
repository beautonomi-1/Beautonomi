import type { SupabaseClient } from "@supabase/supabase-js";
import {
  reverseCardMachineSettlement,
  settleCardMachinePayment,
  type CardMachineEntityType,
} from "@/lib/payments/settle-card-machine-payment";

export type YocoEntityType = CardMachineEntityType;

export interface SettleYocoPaymentInput {
  paymentId: string;
  providerId: string;
  entityType: YocoEntityType;
  entityId: string;
  /** Captured amount in major units. */
  amount: number;
  /** Yoco payment id (used as booking_payments.payment_provider_id base). */
  yocoPaymentId: string;
  processedBy?: string | null;
  currency?: string;
  tipAmount?: number | null;
}

/**
 * Settle a successful Yoco capture with PayCloud-parity tip / group / add-on /
 * product-order / additional-charge handling.
 */
export async function settleYocoPayment(
  supabase: SupabaseClient,
  input: SettleYocoPaymentInput,
): Promise<{ settled: boolean; reason?: string; bookingId?: string }> {
  return settleCardMachinePayment(supabase, {
    paymentProvider: "yoco",
    paymentId: input.paymentId,
    providerId: input.providerId,
    entityType: input.entityType,
    entityId: input.entityId,
    amount: input.amount,
    providerPaymentId: input.yocoPaymentId,
    merchantReference: input.yocoPaymentId,
    processedBy: input.processedBy,
    currency: input.currency,
    tipAmount: input.tipAmount,
    cashbackAmount: 0,
  });
}

export interface ReverseYocoSettlementInput {
  entityType: YocoEntityType;
  entityId: string;
  providerId: string;
  origProviderPaymentId: string;
  voidReference: string;
  processedBy?: string | null;
}

/**
 * Reverse a previously-settled Yoco capture (tip / charge / group suffixes included).
 */
export async function reverseYocoSettlement(
  supabase: SupabaseClient,
  input: ReverseYocoSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  return reverseCardMachineSettlement(supabase, {
    paymentProvider: "yoco",
    entityType: input.entityType,
    entityId: input.entityId,
    providerId: input.providerId,
    origProviderPaymentId: input.origProviderPaymentId,
    voidReference: input.voidReference,
    processedBy: input.processedBy,
  });
}

/**
 * Resolve entity type/id from a provider_yoco_payments row + webhook metadata.
 */
export function resolveYocoSettleEntity(row: {
  entity_type?: string | null;
  entity_id?: string | null;
  appointment_id?: string | null;
  sale_id?: string | null;
  group_booking_id?: string | null;
  metadata?: Record<string, unknown> | null;
}): { entityType: YocoEntityType; entityId: string } | null {
  const meta = row.metadata ?? {};
  const entityType =
    (row.entity_type as YocoEntityType | null | undefined) ||
    (typeof meta.entity_type === "string" ? (meta.entity_type as YocoEntityType) : null);
  const entityId =
    row.entity_id ||
    (typeof meta.entity_id === "string" ? meta.entity_id : null) ||
    null;

  if (entityType && entityId) {
    return { entityType, entityId };
  }

  const groupId =
    row.group_booking_id ||
    (typeof meta.group_booking_id === "string" ? meta.group_booking_id : null);
  if (groupId) return { entityType: "group_booking", entityId: groupId };

  const productOrderId =
    typeof meta.product_order_id === "string" ? meta.product_order_id : null;
  if (productOrderId) return { entityType: "product_order", entityId: productOrderId };

  const additionalChargeId =
    typeof meta.additional_charge_id === "string" ? meta.additional_charge_id : null;
  if (additionalChargeId) {
    return { entityType: "additional_charge", entityId: additionalChargeId };
  }

  if (row.sale_id || typeof meta.sale_id === "string") {
    return {
      entityType: "sale",
      entityId: String(row.sale_id || meta.sale_id),
    };
  }

  const bookingId =
    row.appointment_id ||
    (typeof meta.appointment_id === "string" ? meta.appointment_id : null) ||
    (typeof meta.booking_id === "string" ? meta.booking_id : null);
  if (bookingId) return { entityType: "booking", entityId: bookingId };

  return null;
}
