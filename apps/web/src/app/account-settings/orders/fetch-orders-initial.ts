import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { GET as getOrders } from "@/app/api/me/orders/route";
import type { ProductOrder } from "./order-list-types";

export async function fetchOrdersInitial(): Promise<ProductOrder[]> {
  const req = await createNextRequestFromHeaders("/api/me/orders?page=1&limit=20");
  const res = await getOrders(req);
  const json = (await res.json().catch(() => ({}))) as {
    data?: { orders?: ProductOrder[] };
  };
  if (!res.ok) return [];
  const orders = json?.data?.orders;
  return Array.isArray(orders) ? orders : [];
}
