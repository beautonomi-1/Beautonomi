import type { SupabaseClient } from "@supabase/supabase-js";
import {
  reverseCardMachineSettlement,
  settleCardMachinePayment,
  type CardMachineEntityType,
} from "@/lib/payments/settle-card-machine-payment";

export type PaycloudEntityType = CardMachineEntityType;

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
  tipAmount?: number | null;
  cashbackAmount?: number | null;
}

/**
 * Settle a successful PayCloud capture into Beautonomi finance records.
 * Relies on DB triggers for finance_transactions — never inserts FT here.
 */
export async function settlePaycloudPayment(
  supabase: SupabaseClient,
  input: SettlePaycloudPaymentInput,
): Promise<{ settled: boolean; reason?: string; bookingId?: string }> {
  return settleCardMachinePayment(supabase, {
    paymentProvider: "paycloud",
    paymentId: input.paymentId,
    providerId: input.providerId,
    entityType: input.entityType,
    entityId: input.entityId,
    amount: input.amount,
    providerPaymentId: input.paycloudOrderId || input.merchantOrderNo,
    merchantReference: input.merchantOrderNo,
    processedBy: input.processedBy,
    currency: input.currency,
    tipAmount: input.tipAmount,
    cashbackAmount: input.cashbackAmount,
  });
}

export interface ReversePaycloudSettlementInput {
  entityType: PaycloudEntityType;
  entityId: string;
  providerId: string;
  origProviderPaymentId: string;
  voidReference: string;
  processedBy?: string | null;
  refundAmount?: number | null;
  reversalKind?: "void" | "refund";
}

/**
 * Reverse a previously-settled PayCloud capture after a successful terminal VOID.
 */
export async function reversePaycloudSettlement(
  supabase: SupabaseClient,
  input: ReversePaycloudSettlementInput,
): Promise<{ reversed: boolean; reason?: string }> {
  return reverseCardMachineSettlement(supabase, {
    paymentProvider: "paycloud",
    entityType: input.entityType,
    entityId: input.entityId,
    providerId: input.providerId,
    origProviderPaymentId: input.origProviderPaymentId,
    voidReference: input.voidReference,
    processedBy: input.processedBy,
    refundAmount: input.refundAmount,
    reversalKind: input.reversalKind,
  });
}
