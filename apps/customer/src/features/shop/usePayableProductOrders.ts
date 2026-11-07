import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { scanPayableProductOrders, type ProductOrderPayFields } from "@beautonomi/utils";
import { api } from "@/lib/api-client";

export type PayableProductOrderRow = ProductOrderPayFields & {
  id: string;
  order_number: string;
  currency?: string | null;
  provider?: { id: string; business_name?: string | null } | null;
};

export function usePayableProductOrders(enabled: boolean) {
  const [orders, setOrders] = useState<PayableProductOrderRow[]>([]);
  const [complete, setComplete] = useState(true);
  const requestGen = useRef(0);
  const lastLoadAtMs = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);

  const load = useCallback(async (force?: boolean) => {
    const token = ++requestGen.current;
    if (!enabled) {
      setOrders([]);
      setComplete(true);
      return;
    }
    const now = Date.now();
    if (!force) {
      if (inflight.current) return;
      // Simple debounce to avoid spamming the orders API on rapid focus changes.
      if (now - lastLoadAtMs.current < 8_000) return;
    }
    lastLoadAtMs.current = now;
    const scan = await scanPayableProductOrders(async (page) => {
      const res = await api.get<{
        orders?: PayableProductOrderRow[];
        pagination?: { totalPages?: number };
      }>(`/api/me/orders?status=pending&limit=100&page=${page}`);
      if (res.error || !res.data) throw new Error("payable orders");
      return {
        orders: res.data.orders ?? [],
        totalPages: Number(res.data.pagination?.totalPages ?? 0),
      };
    });
    if (token !== requestGen.current) return;
    setOrders(scan.orders);
    setComplete(scan.complete);
  }, [enabled]);

  const loadWrapped = useCallback(
    (force?: boolean) => {
      const p = load(force).finally(() => {
        inflight.current = null;
      });
      inflight.current = p;
      return p;
    },
    [load],
  );

  useFocusEffect(
    useCallback(() => {
      void loadWrapped(false);
      return () => {
        requestGen.current += 1;
      };
    }, [loadWrapped]),
  );

  return { orders, complete, retry: () => void loadWrapped(true) };
}
