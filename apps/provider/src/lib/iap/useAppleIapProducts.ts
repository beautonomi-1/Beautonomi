import { useCallback, useEffect, useMemo, useState } from "react";
import {
  connectAppleIap,
  fetchAppleStoreProducts,
  type AppleStoreProduct,
} from "@/lib/iap/apple-iap";
import { shouldUseAppleIap } from "@/lib/iap/platform";

export function useAppleIapProducts(productIds: string[]) {
  const [products, setProducts] = useState<AppleStoreProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableIds = useMemo(
    () => [...new Set(productIds.filter(Boolean))].sort().join("|"),
    [productIds],
  );

  const refresh = useCallback(async () => {
    if (!shouldUseAppleIap() || !stableIds) {
      setProducts([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await connectAppleIap();
      const loaded = await fetchAppleStoreProducts(stableIds.split("|"));
      setProducts(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load App Store prices");
    } finally {
      setLoading(false);
    }
  }, [stableIds]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const byId = useMemo(() => {
    const map = new Map<string, AppleStoreProduct>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  return { products, byId, loading, error, refresh };
}
