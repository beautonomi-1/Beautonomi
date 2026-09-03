/**
 * Map a walk-in product_order (+ items) onto the legacy POS sale list shape
 * so sales history can union both sources.
 */

export type SaleHistoryItem = {
  id: string;
  type: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  item_id: string | null;
  product_variant_id: string | null;
};

export type SaleHistoryRow = {
  id: string;
  ref_number: string | null;
  client_name: string | null;
  date: string;
  items: SaleHistoryItem[];
  subtotal: number;
  tax: number;
  total: number;
  payment_method: string;
  payment_status: string;
  team_member_id: string | null;
  team_member_name: string | null;
};

export type WalkInOrderForSale = {
  id: string;
  order_number?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  subtotal?: number | string | null;
  tax_amount?: number | string | null;
  total_amount?: number | string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  staff_id?: string | null;
  legacy_sale_id?: string | null;
};

export type WalkInOrderItemForSale = {
  id: string;
  product_id?: string | null;
  product_variant_id?: string | null;
  product_name?: string | null;
  quantity?: number | null;
  unit_price?: number | string | null;
  total_price?: number | string | null;
};

export function mapWalkInPaymentStatus(status: string | null | undefined): string {
  const s = String(status || "").toLowerCase();
  if (s === "paid") return "completed";
  if (s === "refunded") return "refunded";
  if (s === "failed") return "failed";
  return s || "pending";
}

export function mapWalkInOrderToSaleShape(input: {
  order: WalkInOrderForSale;
  items: WalkInOrderItemForSale[];
  clientName: string | null;
  teamMemberId: string | null;
  teamMemberName: string | null;
}): SaleHistoryRow {
  const { order, items, clientName, teamMemberId, teamMemberName } = input;
  return {
    id: order.id,
    ref_number: order.order_number ?? null,
    client_name: clientName,
    date: order.paid_at || order.created_at || new Date().toISOString(),
    items: items.map((item) => ({
      id: item.id,
      type: "product",
      name: item.product_name || "Product",
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      total: Number(item.total_price || 0),
      item_id: item.product_id ?? null,
      product_variant_id: item.product_variant_id ?? null,
    })),
    subtotal: Number(order.subtotal || 0),
    tax: Number(order.tax_amount || 0),
    total: Number(order.total_amount || 0),
    payment_method: order.payment_method || "cash",
    payment_status: mapWalkInPaymentStatus(order.payment_status),
    team_member_id: teamMemberId,
    team_member_name: teamMemberName,
  };
}

export function mergeSaleHistoryRows(
  sales: SaleHistoryRow[],
  walkIns: SaleHistoryRow[],
  migratedSaleIds: Set<string>,
): SaleHistoryRow[] {
  const fromSales = sales.filter((row) => !migratedSaleIds.has(row.id));
  return [...fromSales, ...walkIns].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}
