import { useState, useCallback, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/providers/AuthProvider";
import { getRuntimeMarketHost } from "@/config/public-env";
import { CART_CACHE_KEY_PREFIX, LEGACY_CART_CACHE_KEY } from "@/lib/cache-keys";
import { emitCartUpdated, onCartUpdated } from "@/lib/cart-events";
import {
  loadGuestCartLines,
  addOrIncrementGuestLine,
  updateGuestLineQuantity,
  removeGuestLine,
  clearGuestCart,
  mergeGuestCartIntoServer,
  guestLineToCartItem,
  type GuestCartLine,
} from "@/lib/guest-cart";
import type { CartItem } from "@/types/api";

function getCartCacheKey(userId: string, marketHost: string): string {
  const host = marketHost.trim().toLowerCase() || "default";
  return `${CART_CACHE_KEY_PREFIX}:${host}:${userId}`;
}

/** Snapshot for guest cart rows (device-only until sign-in). */
export type GuestProductSnapshot = {
  name: string;
  retail_price: number;
  currency: string;
  image_url?: string | null;
  provider_id: string;
  provider_name: string;
  provider_slug: string;
};

function normalizeServerCartItem(raw: unknown): CartItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : null;
  const quantity = typeof r.quantity === "number" ? r.quantity : 0;
  if (!id || quantity < 1) return null;
  return raw as CartItem;
}

export function useCart() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const mergeDoneForUserRef = useRef<string | null>(null);

  const cacheKey = user?.id
    ? getCartCacheKey(user.id, getRuntimeMarketHost())
    : LEGACY_CART_CACHE_KEY;

  const reloadGuestCart = useCallback(async () => {
    const lines = await loadGuestCartLines();
    setItems(lines.map((l) => guestLineToCartItem(l)));
    setLoading(false);
    setError(null);
    setFromCache(false);
  }, []);

  const fetchCart = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      await reloadGuestCart();
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
          const raw = await AsyncStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) {
              const list = parsed.map(normalizeServerCartItem).filter(Boolean) as CartItem[];
              setItems(list);
              setFromCache(true);
            }
          }
        } catch {}
      }
    } else {
      const list = (res.data?.items ?? []).map(normalizeServerCartItem).filter(Boolean) as CartItem[];
      setItems(list);
      try {
        await AsyncStorage.setItem(cacheKey, JSON.stringify(list));
      } catch {}
    }
    setLoading(false);
  }, [user, authLoading, cacheKey, reloadGuestCart]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      mergeDoneForUserRef.current = null;
      void reloadGuestCart();
      return;
    }
    void (async () => {
      const uid = user.id;
      if (mergeDoneForUserRef.current !== uid) {
        try {
          await mergeGuestCartIntoServer();
        } catch {
          // Non-blocking — user still sees server cart
        }
        mergeDoneForUserRef.current = uid;
      }
      await fetchCart();
    })();
  }, [user, authLoading, fetchCart, reloadGuestCart]);

  useEffect(() => {
    const off = onCartUpdated(() => {
      if (authLoading) return;
      if (!user) void reloadGuestCart();
      else void fetchCart();
    });
    return off;
  }, [user, authLoading, fetchCart, reloadGuestCart]);

  const addToCart = useCallback(
    async (
      productId: string,
      quantity = 1,
      productVariantId?: string | null,
      guestSnapshot?: GuestProductSnapshot | null,
    ) => {
      if (authLoading) return { error: "Please wait…" };

      if (!user) {
        if (!guestSnapshot) {
          return { error: "Sign in to add this item, or open the product page to continue as a guest." };
        }
        const line: GuestCartLine = {
          product_id: productId,
          product_variant_id: productVariantId ?? null,
          quantity,
          name: guestSnapshot.name,
          retail_price: guestSnapshot.retail_price,
          currency: guestSnapshot.currency,
          image_url: guestSnapshot.image_url ?? null,
          provider_id: guestSnapshot.provider_id,
          provider_name: guestSnapshot.provider_name,
          provider_slug: guestSnapshot.provider_slug,
        };
        await addOrIncrementGuestLine(line);
        await reloadGuestCart();
        return { error: null };
      }

      const body: Record<string, unknown> = { product_id: productId, quantity };
      if (productVariantId) body.product_variant_id = productVariantId;
      const res = await api.post<{ item: CartItem }>("/api/me/cart", body);
      if (res.error) return { error: getApiErrorMessage(res.error, "Could not add to cart") };
      await fetchCart();
      emitCartUpdated();
      return { error: null };
    },
    [user, authLoading, fetchCart, reloadGuestCart],
  );

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      if (quantity < 1) return { error: "Invalid quantity" };
      if (!user) {
        const { parseSyntheticGuestCartItemId } = await import("@/lib/guest-cart");
        const parsed = parseSyntheticGuestCartItemId(itemId);
        if (!parsed) return { error: "Invalid item" };
        await updateGuestLineQuantity(parsed.product_id, parsed.variant_id, quantity);
        await reloadGuestCart();
        return { error: null };
      }
      const res = await api.patch<{ item: CartItem }>(`/api/me/cart/${itemId}`, {
        quantity,
      });
      if (res.error) return { error: getApiErrorMessage(res.error, "Could not update quantity") };
      await fetchCart();
      return { error: null };
    },
    [user, fetchCart, reloadGuestCart],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      if (!user) {
        const { parseSyntheticGuestCartItemId } = await import("@/lib/guest-cart");
        const parsed = parseSyntheticGuestCartItemId(itemId);
        if (!parsed) return { error: "Invalid item" };
        await removeGuestLine(parsed.product_id, parsed.variant_id);
        await reloadGuestCart();
        return { error: null };
      }
      const res = await api.delete(`/api/me/cart/${itemId}`);
      if (res.error) return { error: getApiErrorMessage(res.error, "Could not remove item") };
      await fetchCart();
      emitCartUpdated();
      return { error: null };
    },
    [user, fetchCart, reloadGuestCart],
  );

  const clearCart = useCallback(async () => {
    if (!user) {
      await clearGuestCart();
      await reloadGuestCart();
      return { error: null };
    }
    const res = await api.delete("/api/me/cart");
    if (res.error) return { error: getApiErrorMessage(res.error, "Could not clear cart") };
    setItems([]);
    emitCartUpdated();
    return { error: null };
  }, [user, reloadGuestCart]);

  const lineUnit = (i: CartItem) =>
    typeof i.effective_price === "number" && Number.isFinite(i.effective_price)
      ? i.effective_price
      : (i.product_variant?.retail_price ?? i.product?.retail_price ?? 0) || 0;

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + lineUnit(i) * i.quantity, 0);

  const groupedByProvider = items.reduce(
    (acc, item) => {
      const pid = item.provider?.id ?? "unknown";
      if (!acc[pid]) {
        acc[pid] = { provider: item.provider, items: [], subtotal: 0 };
      }
      acc[pid].items.push(item);
      acc[pid].subtotal += lineUnit(item) * item.quantity;
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
    isGuestCart: !user,
  };
}
