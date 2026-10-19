import { buildSaleReceiptPayload } from "@/lib/receipts/build-sale-receipt";

type WalkInOrderRow = Record<string, unknown> & {
  id?: string;
  order_number?: string | null;
  created_at?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  subtotal?: string | number | null;
  tax_amount?: string | number | null;
  discount_amount?: string | number | null;
  total_amount?: string | number | null;
  customer_id?: string | null;
  customer_name?: string | null;
  staff_id?: string | null;
};

type WalkInOrderItemRow = {
  product_name?: string | null;
  quantity?: number | null;
  unit_price?: string | number | null;
  total_price?: string | number | null;
};

function mapWalkInPaymentStatusToSale(status: unknown): string {
  const s = String(status ?? "");
  if (s === "paid") return "completed";
  if (s === "pending") return "pending";
  return s || "completed";
}

export function buildWalkInProductOrderSaleReceipt(input: {
  order: WalkInOrderRow;
  items: WalkInOrderItemRow[];
  provider?: {
    business_name?: string | null;
    receipt_header?: string | null;
    receipt_footer?: string | null;
  } | null;
  customer?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
  staff?: { name?: string | null } | null;
  currency?: string;
}) {
  const order = input.order;
  const saleShaped = {
    sale_number: order.order_number,
    ref_number: order.order_number,
    sale_date: order.created_at,
    created_at: order.created_at,
    payment_status: mapWalkInPaymentStatusToSale(order.payment_status),
    payment_method: order.payment_method,
    payment_provider: order.payment_method,
    subtotal: order.subtotal,
    tax_amount: order.tax_amount,
    discount_amount: order.discount_amount ?? 0,
    total_amount: order.total_amount,
    notes: "Walk-in product sale",
  };

  const saleItems = input.items.map((it) => ({
    item_type: "product",
    item_name: it.product_name ?? "Product",
    quantity: it.quantity ?? 1,
    unit_price: Number(it.unit_price ?? 0),
    total_price: Number(it.total_price ?? 0),
  }));

  const customer =
    input.customer ??
    (order.customer_name
      ? { full_name: String(order.customer_name), name: String(order.customer_name) }
      : { full_name: "Walk-in", name: "Walk-in" });

  return buildSaleReceiptPayload({
    sale: saleShaped,
    items: saleItems,
    provider: input.provider,
    customer,
    staff: input.staff,
    currency: input.currency,
  });
}
