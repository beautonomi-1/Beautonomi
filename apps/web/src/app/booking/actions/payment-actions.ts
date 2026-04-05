"use server";

import { fetcher } from "@/lib/http/fetcher";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

interface InitializePaymentParams {
  email: string;
  amount: number;
  metadata: {
    bookingData?: string;
    bookingId?: string;
    bookingNumber?: string;
    paymentOption?: string;
    saveCard?: string;
    setAsDefault?: string;
    [key: string]: string | undefined;
  };
}

interface PaymentResult {
  authorization_url: string;
  reference: string;
}

interface ChargeSavedCardParams {
  payment_method_id: string;
  amount: number;
  email: string;
  currency?: string;
  metadata?: Record<string, any>;
}

interface ChargeResult {
  status: string;
  reference: string;
  message?: string;
  transaction?: { status: string; reference: string };
}

/**
 * Server Action to initialize Paystack payment (redirect flow)
 */
export async function initializePayment(
  params: InitializePaymentParams
): Promise<PaymentResult> {
  try {
    const response = await fetcher.post<{ data: PaymentResult }>(
      "/api/paystack/initialize",
      {
        email: params.email,
        amount: params.amount,
        metadata: params.metadata,
      }
    );

    return response.data;
  } catch (error: any) {
    throw new Error(error.message || "Failed to initialize payment");
  }
}

/**
 * Server Action to charge a saved card directly (no redirect)
 */
export async function chargeSavedCard(
  params: ChargeSavedCardParams
): Promise<ChargeResult> {
  try {
    const response = await fetcher.post<{ data: ChargeResult }>(
      "/api/payments/charge-saved-card",
      {
        payment_method_id: params.payment_method_id,
        amount: params.amount,
        email: params.email,
        currency: params.currency || LAST_RESORT_CURRENCY,
        metadata: params.metadata,
      }
    );

    return response.data;
  } catch (error: any) {
    throw new Error(error.message || "Failed to charge saved card");
  }
}
