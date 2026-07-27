export type ReceiptAudience = "customer" | "provider";

export type ReceiptKind = "booking" | "order" | "sale";

export interface ReceiptParty {
  label: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface ReceiptLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** Staff name, duration, variant — shown on its own line when present. */
  meta?: string | null;
}

export interface ReceiptMoneyLine {
  label: string;
  amount: number;
  tone?: "neutral" | "discount" | "emphasis";
}

export interface ReceiptPayment {
  label: string;
  amount: number;
  detail?: string | null;
}

export interface ReceiptFulfillment {
  type?: string | null;
  address?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  trackingUrl?: string | null;
  estimatedDelivery?: string | null;
  instructions?: string | null;
}

export interface ReceiptRefund {
  amount: number;
  reason?: string | null;
  method?: string | null;
  date?: string | null;
}

export interface ReceiptDepositInfo {
  required: boolean;
  amount?: number | null;
  percentage?: number | null;
  option?: string | null;
}

/** Canonical share payload — audience guardrails enforced in the formatter. */
export interface ReceiptShareModel {
  kind: ReceiptKind;
  audience: ReceiptAudience;
  reference: string;
  title: string;
  status?: string | null;
  paymentStatus?: string | null;
  when?: string | null;
  whenLabel?: string | null;
  parties: ReceiptParty[];
  location?: string | null;
  visitType?: string | null;
  lineItems: ReceiptLineItem[];
  moneyLines: ReceiptMoneyLine[];
  payments: ReceiptPayment[];
  balanceDue?: number | null;
  total: number;
  currency: string;
  fulfillment?: ReceiptFulfillment | null;
  refund?: ReceiptRefund | null;
  deepLink?: string | null;
  /** Provider-audience only — stripped for customer shares. */
  referralSource?: string | null;
  bookingSource?: string | null;
  groupBookingRef?: string | null;
  groupParticipants?: string[] | null;
  notes?: string | null;
  deposit?: ReceiptDepositInfo | null;
}
