import { useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";

export interface ProductOrder {
  id: string;
  order_number: string;
  status: string;
  fulfillment_type: "collection" | "delivery";
  subtotal: number;
  tax_amount: number;
  delivery_fee: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  payment_status: string;
  tracking_number: string | null;
  estimated_delivery_date: string | null;
  created_at: string;
  confirmed_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  items: OrderItem[];
  provider: {
    id: string;
    business_name: string;
    slug: string;
  };
  delivery_address?: {
    id: string;
    label: string | null;
    address_line1: string;
    city: string;
    postal_code: string | null;
  } | null;
  collection_location?: {
    id: string;
    name: string;
    address_line1: string;
    city: string;
    phone: string | null;
    working_hours: Record<string, unknown>;
  } | null;
}

export interface OrderItem {
  id: string;
  product_id: string;
  product_name: string;
  product_image_url: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export function useProductOrders() {
  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async (status?: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const res = await api.get<{ orders: ProductOrder[] }>(`/api/me/orders?${params}`);
    if (res.error) {
      setError(getApiErrorMessage(res.error, "Failed to load orders"));
    } else {
      setOrders(res.data?.orders ?? []);
    }
    setLoading(false);
  }, []);

  const fetchOrderDetail = useCallback(async (orderId: string) => {
    const res = await api.get<{ order: ProductOrder }>(`/api/me/orders/${orderId}`);
      if (res.error) return { data: null, error: getApiErrorMessage(res.error, "Failed to load order") };
    return { data: res.data?.order ?? null, error: null };
  }, []);

  const createOrder = useCallback(
    async (payload: {
      provider_id: string;
      fulfillment_type: "collection" | "delivery";
      delivery_address_id?: string;
      delivery_instructions?: string;
      collection_location_id?: string;
      payment_method?: string;
      use_wallet?: boolean;
    }) => {
      const res = await api.post<{ order: ProductOrder; paid_with_wallet?: boolean; amount_due?: number }>("/api/me/orders", payload as any);
      if (res.error) return { data: null, paid_with_wallet: false, amount_due: undefined, error: getApiErrorMessage(res.error, "Your order could not be placed.") };
      return {
        data: res.data?.order ?? null,
        paid_with_wallet: res.data?.paid_with_wallet ?? false,
        amount_due: res.data?.amount_due,
        error: null,
      };
    },
    [],
  );

  return {
    orders,
    loading,
    error,
    fetchOrders,
    fetchOrderDetail,
    createOrder,
  };
}
