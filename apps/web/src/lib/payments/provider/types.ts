export type SettlementModel =
  | "platform_mor_transfer"
  | "connected_mor_destination"
  | "separate_charges_transfers";

export type PaymentProviderCapabilities = {
  supportsSavedCards: boolean;
  supportsSubscriptions: boolean;
  supportsNativeMobileSdk: boolean;
  supportsRefunds: boolean;
  supportsConnectPayouts: boolean;
};

export type PaymentInitParams = {
  email: string;
  amountInSmallestUnit: number;
  currency: string;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
  tenantId?: string | null;
  /** Stripe Connect / Paystack subaccount routing */
  connectedAccountId?: string;
  settlementModel?: SettlementModel;
};

export type PaymentInitResult = {
  provider: string;
  reference: string;
  authorizationUrl?: string;
  accessCode?: string;
  clientSecret?: string;
  paymentIntentId?: string;
};

export type PaymentRefundParams = {
  providerPaymentId: string;
  amountInSmallestUnit?: number;
  currency: string;
  reason?: string;
  tenantId?: string | null;
  idempotencyKey?: string;
};

export type PaymentRefundResult = {
  provider: string;
  refundId: string;
  status: string;
};

export type VerifiedWebhookEvent = {
  provider: string;
  id: string;
  type: string;
  raw: unknown;
};

export interface PaymentProvider {
  readonly id: string;
  readonly capabilities: PaymentProviderCapabilities;
  initializePayment(params: PaymentInitParams): Promise<PaymentInitResult>;
  verifyPayment(reference: string, tenantId?: string | null): Promise<{ paid: boolean; raw?: unknown }>;
  refund(params: PaymentRefundParams): Promise<PaymentRefundResult>;
  verifyWebhook(payload: string | Buffer, signature: string, tenantId?: string | null): Promise<VerifiedWebhookEvent>;
  settlementModel(config: Record<string, unknown>): SettlementModel;
}
