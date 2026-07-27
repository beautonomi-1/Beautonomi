/**
 * Canonical receipt payload for POS / walk-in sales (`sales` + `sale_items`).
 */

export type SaleItemLike = {
  item_type?: string | null;
  item_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
  product_variant_id?: string | null;
};

export type SaleRowLike = Record<string, unknown>;

export interface SaleReceiptItem {
  item_type: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export function mapSaleReceiptItems(items: SaleItemLike[] | null | undefined): SaleReceiptItem[] {
  return (
    items?.map((it) => ({
      item_type: String(it.item_type || "product"),
      name: String(it.item_name || "Item"),
      quantity: Number(it.quantity || 1),
      unit_price: Number(it.unit_price || 0),
      total_price: Number(it.total_price || 0),
    })) ?? []
  );
}

function parseTipFromNotes(notes: unknown): number {
  if (typeof notes !== "string") return 0;
  const match = notes.match(/Tip:\s*([\d.]+)/i);
  if (!match?.[1]) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : 0;
}

export function buildSaleReceiptPayload(input: {
  sale: SaleRowLike;
  items?: SaleItemLike[] | null;
  provider?: { business_name?: string | null; receipt_header?: string | null; receipt_footer?: string | null } | null;
  customer?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
  staff?: { name?: string | null } | null;
  currency?: string;
}) {
  const sale = input.sale;
  const items = mapSaleReceiptItems(input.items);
  const subtotal = Number(sale.subtotal || 0);
  const taxAmount = Number(sale.tax_amount || 0);
  const discountAmount = Number(sale.discount_amount || 0);
  const tipAmount = parseTipFromNotes(sale.notes);
  const totalAmount = Number(sale.total_amount || 0);
  const paymentStatus = String(sale.payment_status ?? "completed");
  const isPaid = paymentStatus === "completed" || paymentStatus === "paid";
  const amountPaid = isPaid ? totalAmount : 0;
  const isWalkIn = typeof sale.notes === "string" && sale.notes.includes("Walk-in");

  return {
    sale_number: sale.sale_number ?? sale.ref_number,
    ref_number: sale.ref_number ?? sale.sale_number,
    sale_date: sale.sale_date ?? sale.created_at,
    status: paymentStatus,
    payment_status: paymentStatus,
    payment_method: sale.payment_method ?? null,
    payment_provider: sale.payment_provider ?? null,
    payment_provider_id: sale.payment_provider_id ?? null,
    is_walk_in: isWalkIn,
    subtotal,
    tax_amount: taxAmount,
    discount_amount: discountAmount,
    tip_amount: tipAmount,
    total_amount: totalAmount,
    amount_paid: amountPaid,
    balance_due: Math.max(0, totalAmount - amountPaid),
    currency: input.currency ?? "ZAR",
    notes: sale.notes ?? null,
    provider: input.provider
      ? {
          name: input.provider.business_name ?? null,
          business_name: input.provider.business_name ?? null,
        }
      : null,
    customer: input.customer
      ? {
          name: input.customer.full_name ?? null,
          full_name: input.customer.full_name ?? null,
          email: input.customer.email ?? null,
          phone: input.customer.phone ?? null,
        }
      : isWalkIn
        ? { name: "Walk-in", full_name: "Walk-in" }
        : null,
    staff: input.staff?.name ?? null,
    items,
    receipt_header: input.provider?.receipt_header ?? null,
    receipt_footer: input.provider?.receipt_footer ?? null,
  };
}
