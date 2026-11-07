import { scanPayableProductOrders, type ProductOrderPayFields } from "@beautonomi/utils";

export type PayableProductOrderRow = ProductOrderPayFields & {
  id: string;
  order_number: string;
  currency?: string | null;
  provider?: { id: string; business_name?: string | null } | null;
};

export function loadPayableProductOrders() {
  return scanPayableProductOrders(async (page) => {
    const res = await fetch(`/api/me/orders?status=pending&limit=100&page=${page}`, {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    });
    const json = (await res.json()) as {
      data?: {
        orders?: PayableProductOrderRow[];
        pagination?: { totalPages?: number };
      };
    };
    if (!res.ok || !json.data) throw new Error("payable orders");
    return {
      orders: json.data.orders ?? [],
      totalPages: Number(json.data.pagination?.totalPages ?? 0),
    };
  });
}
