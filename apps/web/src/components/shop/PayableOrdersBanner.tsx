"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@beautonomi/i18n";
import {
  loadPayableProductOrders,
  type PayableProductOrderRow,
} from "@/lib/orders/load-payable-product-orders";
import { getAmplitudeInstance } from "@/lib/analytics/amplitude/client";
import {
  EVENT_PAYABLE_ORDERS_BANNER_SHOWN,
  EVENT_PAYABLE_ORDERS_PAY_CLICKED,
} from "@/lib/analytics/amplitude/types";

export function PayableOrdersBanner({
  enabled,
  currencyFallback,
  context,
  collapse = true,
}: {
  enabled: boolean;
  currencyFallback: string;
  context: "cart" | "orders";
  collapse?: boolean;
}) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<PayableProductOrderRow[]>([]);
  const [complete, setComplete] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const lastShownRef = useRef<string>("");
  const lastLoadAtMs = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (force?: boolean) => {
    if (!enabled) {
      setOrders([]);
      setComplete(true);
      return;
    }
    const now = Date.now();
    if (inflight.current) return;
    if (!force && now - lastLoadAtMs.current < 8_000) return;
    lastLoadAtMs.current = now;
    const p = loadPayableProductOrders()
      .then((scan) => {
        if (!mountedRef.current) return;
        setOrders(scan.orders);
        setComplete(scan.complete);
      })
      .finally(() => {
        inflight.current = null;
      });
    inflight.current = p;
    await p;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setOrders([]);
      setComplete(true);
      return;
    }
    void load(true).finally(() => {
      /* load already updates state; gate cleanup below */
    });
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void load(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, load]);

  if (!enabled || (orders.length === 0 && complete)) return null;

  const title =
    context === "cart"
      ? (t("web.components.payableOrdersBanner.titleCart") as string)
      : (t("web.components.payableOrdersBanner.titleOrders") as string);
  const summaryKey =
    orders.length === 1 ? "web.components.payableOrdersBanner.summary_one" : "web.components.payableOrdersBanner.summary_other";
  const summary = t(summaryKey, { count: orders.length }) as string;

  const visibleOrders = useMemo(() => {
    if (!collapse || expanded) return orders;
    return orders.length > 0 ? [orders[0]] : [];
  }, [orders, collapse, expanded]);

  useEffect(() => {
    if (!enabled || orders.length === 0) return;
    const key = `${context}:${orders.length}:${complete ? "1" : "0"}`;
    if (lastShownRef.current === key) return;
    lastShownRef.current = key;
    getAmplitudeInstance()?.track(EVENT_PAYABLE_ORDERS_BANNER_SHOWN, {
      portal: "web",
      context,
      count: orders.length,
      complete,
    });
  }, [enabled, context, orders.length, complete]);

  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">
        {title}
      </p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-amber-900">{summary}</p>
        {collapse && orders.length > 1 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-bold text-pink-700 hover:text-pink-800"
          >
            {expanded
              ? (t("web.components.payableOrdersBanner.showLess") as string)
              : (t("web.components.payableOrdersBanner.viewAll") as string)}
          </button>
        ) : null}
      </div>
      <div className="mt-3 space-y-3">
        {visibleOrders.map((order) => {
          const due = typeof order.amount_still_due === "number" ? order.amount_still_due : 0;
          const currency = (order.currency && order.currency.trim()) || currencyFallback;
          return (
            <div key={order.id} className="flex items-center justify-between gap-3">
              <div>
                {order.provider?.business_name ? (
                  <p className="text-xs text-gray-500">{order.provider.business_name}</p>
                ) : null}
                <p className="font-semibold text-gray-900">{order.order_number}</p>
                <p className="text-sm text-amber-900">
                  {currency} {due.toFixed(2)}
                </p>
              </div>
              <Link
                href={`/account-settings/orders/${order.id}?startPay=1`}
                className="rounded-xl bg-pink-600 px-3 py-2 text-sm font-semibold text-white hover:bg-pink-700"
                onClick={() => {
                  getAmplitudeInstance()?.track(EVENT_PAYABLE_ORDERS_PAY_CLICKED, {
                    portal: "web",
                    context,
                    order_id: order.id,
                    provider_id: order.provider?.id ?? undefined,
                    amount_due: due,
                    currency,
                  });
                }}
              >
                {t("web.accountSettings.orderDetail.payOnline", {
                  currency,
                  amount: due.toFixed(2),
                })}
              </Link>
            </div>
          );
        })}
      </div>
      {!complete ? (
        <button
          type="button"
          onClick={() => void load(true)}
          className="mt-3 text-sm font-semibold text-pink-700 hover:text-pink-800"
        >
          {t("web.components.payableOrdersBanner.retry")}
        </button>
      ) : null}
    </div>
  );
}
