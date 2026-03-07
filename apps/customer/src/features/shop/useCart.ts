import { useState, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/providers/AuthProvider";

const CART_CACHE_KEY = "beautonomi_cart";

export interface CartItem {
  id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  in_stock: boolean;
  stock_available: number;
  product: {
    id: string;
    name: string;
    retail_price: number;
    image_urls: string[];
    quantity: number;
    is_active: boolean;
    retail_sales_enabled: boolean;
    brand: string | null;
    category: string | null;
    provider_id: string;
  };
  provider: {
    id: string;
    business_name: string;
    slug: string;
  };
}

export function useCart() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fromCache, setFromCache] = useState(false);

  const fetchCart = useCallback(async () => {
    if (authLoading || !user) {
      setItems([]);
      setLoading(false);
      setError(null);
      setFromCache(false);
      return;
    }
    setLoading(true);
    setError(null);
    setFromCache(false);
    const res = await api.get<{ items: CartItem[] }>("/api/me/cart");
    const status = (res.error as { status?: number } | undefined)?.status;
    if (res.error) {
      if (status === 403 || status === 401) {
        setItems([]);
        setError(null);
      } else {
        setError(getApiErrorMessage(res.error, "Failed to load cart"));
        try {
          const raw = await AsyncStorage.getItem(CART_CACHE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as CartItem[];
            if (Array.isArray(parsed)) {
              setItems(parsed);
              setFromCache(true);
            }
          }
        } catch {}
      }
    } else {
      const list = res.data?.items ?? [];
      setItems(list);
      try {
        await AsyncStorage.setItem(CART_CACHE_KEY, JSON.stringify(list));
      } catch {}
    }
    setLoading(false);
  }, [user, authLoading]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
    fetchCart();
  }, [user, authLoading, fetchCart]);

  const addToCart = useCallback(
    async (productId: string, quantity = 1) => {
      const res = await api.post<{ item: CartItem }>("/api/me/cart", {
        product_id: productId,
        quantity,
      });
      if (res.error) return { error: getApiErrorMessage(res.error, "Could not add to cart") };
      await fetchCart();
      return { error: null };
    },
    [fetchCart],
  );

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      const res = await api.patch<{ item: CartItem }>(`/api/me/cart/${itemId}`, {
        quantity,
      });
      if (res.error) return { error: getApiErrorMessage(res.error, "Could not update quantity") };
      await fetchCart();
      return { error: null };
    },
    [fetchCart],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const res = await api.delete(`/api/me/cart/${itemId}`);
      if (res.error) return { error: getApiErrorMessage(res.error, "Could not remove item") };
      await fetchCart();
      return { error: null };
    },
    [fetchCart],
  );

  const clearCart = useCallback(async () => {
    const res = await api.delete("/api/me/cart");
    if (res.error) return { error: getApiErrorMessage(res.error, "Could not clear cart") };
    setItems([]);
    return { error: null };
  }, []);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce(
    (sum, i) => sum + (i.product?.retail_price ?? 0) * i.quantity,
    0,
  );

  // Group items by provider
  const groupedByProvider = items.reduce(
    (acc, item) => {
      const pid = item.provider?.id ?? "unknown";
      if (!acc[pid]) {
        acc[pid] = { provider: item.provider, items: [], subtotal: 0 };
      }
      acc[pid].items.push(item);
      acc[pid].subtotal += (item.product?.retail_price ?? 0) * item.quantity;
      return acc;
    },
    {} as Record<
      string,
      { provider: CartItem["provider"]; items: CartItem[]; subtotal: number }
    >,
  );

  return {
    items,
    loading,
    error,
    fromCache,
    itemCount,
    subtotal,
    groupedByProvider,
    fetchCart,
    addToCart,
    updateQuantity,
    removeItem,
    clearCart,
  };
}
