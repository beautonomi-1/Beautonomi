/**
 * Canonical receipt math for product order JSON/PDF surfaces.
 */
import { subtractMoney, addMoney, multiplyMoney, roundCurrency } from "@beautonomi/utils";

export type OrderItemLike = {
  product_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
  product_variant?: { option_values?: Record<string, unknown> | null } | null;
};

export type ProductOrderRowLike = Record<string, unknown>;

export interface OrderReceiptItem {
  name: string;
  variant_label: string | null;
  quantity: number;
  price: number;
  line_total: number;
  total: number;
}

export interface ComputedOrderReceiptFinancials {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  discount: number;
  platformFee: number;
  walletPaid: number;
  giftPaid: number;
  cardPaid: number;
  totalFromRow: number;
  amountPaid: number;
  balanceDue: number;
  items: OrderReceiptItem[];
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function mapOrderReceiptItems(items: OrderItemLike[] | null | undefined): OrderReceiptItem[] {
  return (
    items?.map((it) => {
      const ov = it.product_variant?.option_values;
      const variantLabel =
        ov && typeof ov === "object" ? Object.values(ov).join(" / ") : "";
      const qty = num(it.quantity, 1);
      const unit = num(it.unit_price);
      const lineTotal = num(it.total_price, multiplyMoney(unit, qty));
      const name = String(it.product_name || "Product");
      return {
        name,
        variant_label: variantLabel || null,
        quantity: qty,
        price: unit,
        line_total: lineTotal,
        total: lineTotal,
      };
    }) ?? []
  );
}

/**
 * Normalized financial slice for a product order receipt.
 */
export function computeOrderReceiptFinancials(input: {
  order: ProductOrderRowLike;
  items?: OrderItemLike[] | null;
  /** Successful card charges already stored for this order. Wallet and gift rows are excluded. */
  cardPaid?: number | null;
}): ComputedOrderReceiptFinancials {
  const order = input.order;
  const subtotal = num(order.subtotal);
  const tax = num(order.tax_amount);
  const deliveryFee = num(order.delivery_fee);
  const discount = num(order.discount_amount);
  const platformFee = num(order.platform_fee);
  const walletPaid = num(order.wallet_amount);
  const giftPaid = num(order.gift_card_amount);
  const cardPaid = Math.max(0, num(input.cardPaid));
  const totalFromRow =
    order.total_amount != null && !Number.isNaN(Number(order.total_amount))
      ? num(order.total_amount)
      : subtractMoney(addMoney(addMoney(addMoney(subtotal, tax), deliveryFee), platformFee), discount);

  const paymentStatus = String(order.payment_status ?? "").toLowerCase();
  const refunded = num(order.refunded_amount);

  let amountPaid = 0;
  let balanceDue = totalFromRow;

  switch (paymentStatus) {
    case "paid":
    case "completed":
      amountPaid = totalFromRow;
      balanceDue = 0;
      break;
    case "partially_refunded":
      // Net collected after partial refund; order itself is still settled.
      amountPaid = Math.max(0, subtractMoney(totalFromRow, refunded));
      balanceDue = 0;
      break;
    case "refunded":
      amountPaid = Math.max(0, subtractMoney(totalFromRow, refunded));
      balanceDue = 0;
      break;
    case "pending":
    case "failed":
    default:
      amountPaid = Math.min(totalFromRow, addMoney(addMoney(walletPaid, giftPaid), cardPaid));
      balanceDue = Math.max(0, subtractMoney(totalFromRow, amountPaid));
      break;
  }

  return {
    subtotal,
    tax,
    deliveryFee,
    discount,
    platformFee,
    walletPaid,
    giftPaid,
    cardPaid,
    totalFromRow,
    amountPaid,
    balanceDue,
    items: mapOrderReceiptItems(input.items),
  };
}

export interface OrderReceiptPayloadExtras {
  payment_method?: string | null;
  payment_reference?: string | null;
  paid_at?: string | null;
  tracking_number?: string | null;
  carrier?: string | null;
  tracking_url?: string | null;
  estimated_delivery_date?: string | null;
  delivery_instructions?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  order_source?: string | null;
  booking_id?: string | null;
  staff_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  refund_method?: string | null;
  refunded_amount?: number | null;
  refunded_at?: string | null;
  refund_reason?: string | null;
}

const RECEIPT_CARD_EXCLUDED_PROVIDERS = new Set(["wallet", "gift_card"]);

/** Card money already recorded on an unpaid order. Wallet and gift stay on the order columns. */
export async function loadProductOrderReceiptCardPaid(
  supabase: { from: (table: string) => any },
  orderId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("payment_transactions")
    .select("amount, provider")
    .eq("status", "success")
    .filter("metadata->>product_order_id", "eq", orderId);
  if (error) return 0;
  const total = (data ?? []).reduce((sum: number, row: { amount?: number | string | null; provider?: string | null }) => {
    const provider = String(row.provider ?? "").trim().toLowerCase();
    if (RECEIPT_CARD_EXCLUDED_PROVIDERS.has(provider)) return sum;
    return addMoney(sum, num(row.amount));
  }, 0);
  return roundCurrency(total);
}

export function buildOrderReceiptCore(input: {
  order: ProductOrderRowLike;
  items?: OrderItemLike[] | null;
  extras?: OrderReceiptPayloadExtras;
  cardPaid?: number | null;
}) {
  const finances = computeOrderReceiptFinancials(input);
  const order = input.order;
  const extras = input.extras ?? {};

  return {
    ...finances,
    order_number: order.order_number,
    order_date: order.created_at,
    status: order.status,
    fulfillment_type: order.fulfillment_type,
    payment_status: order.payment_status,
    currency: order.currency,
    payment_method: extras.payment_method ?? order.payment_method ?? null,
    payment_reference: extras.payment_reference ?? order.payment_reference ?? null,
    paid_at: extras.paid_at ?? order.paid_at ?? null,
    amount_paid: finances.amountPaid,
    balance_due: finances.balanceDue,
    tracking_number: extras.tracking_number ?? order.tracking_number ?? null,
    carrier: extras.carrier ?? order.carrier ?? null,
    tracking_url: extras.tracking_url ?? order.tracking_url ?? null,
    estimated_delivery_date:
      extras.estimated_delivery_date ?? order.estimated_delivery_date ?? null,
    delivery_instructions:
      extras.delivery_instructions ?? order.delivery_instructions ?? null,
    shipped_at: extras.shipped_at ?? order.shipped_at ?? null,
    delivered_at: extras.delivered_at ?? order.delivered_at ?? null,
    cancelled_at: extras.cancelled_at ?? order.cancelled_at ?? null,
    cancellation_reason:
      extras.cancellation_reason ?? order.cancellation_reason ?? null,
    order_source: extras.order_source ?? order.order_source ?? null,
    booking_id: extras.booking_id ?? order.booking_id ?? null,
    staff_id: extras.staff_id ?? order.staff_id ?? null,
    customer_name: extras.customer_name ?? order.customer_name ?? null,
    customer_phone: extras.customer_phone ?? order.customer_phone ?? null,
    refund_method: extras.refund_method ?? order.refund_method ?? null,
    refunded_amount: num(extras.refunded_amount ?? order.refunded_amount),
    refunded_at: extras.refunded_at ?? order.refunded_at ?? null,
    refund_reason: extras.refund_reason ?? order.refund_reason ?? null,
  };
}
