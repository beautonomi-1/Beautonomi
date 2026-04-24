import OrdersPageClient from "./OrdersPageClient";
import { fetchOrdersInitial } from "./fetch-orders-initial";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialAllTabOrders = await fetchOrdersInitial();
  return <OrdersPageClient initialAllTabOrders={initialAllTabOrders} />;
}
