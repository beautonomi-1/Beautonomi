"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Minus, Plus, Search, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { openProductOrderView } from "@/stores/appointment-sidebar-store";
import { percentOf, sumMoney } from "@beautonomi/utils";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { Input } from "@/components/ui/input";
import {
  BookingBottomSheet,
  BookingActionButton,
  BookingSectionCard,
  BookingSectionLabel,
  BookingSummaryRow,
} from "../ui";

const YocoPaymentDialog = dynamic(
  () =>
    import("@/components/provider-portal/YocoPaymentDialog").then((m) => ({
      default: m.YocoPaymentDialog,
    })),
  { ssr: false },
);

const PayCloudPaymentDialog = dynamic(
  () =>
    import("@/components/provider-portal/PayCloudPaymentDialog").then((m) => ({
      default: m.PayCloudPaymentDialog,
    })),
  { ssr: false },
);

interface WalkInProduct {
  id: string;
  name: string;
  retail_price: number;
  tax_rate: number;
  quantity: number;
}

interface CartLine {
  product: WalkInProduct;
  qty: number;
}

interface WalkInSaleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function cartTotals(cart: CartLine[], taxRate: number) {
  const subtotal = sumMoney(...cart.map((c) => c.product.retail_price * c.qty));
  const taxAmount = percentOf(subtotal, taxRate);
  return { subtotal, taxAmount, grandTotal: subtotal + taxAmount };
}

export function WalkInSaleSheet({ open, onOpenChange, onSuccess }: WalkInSaleSheetProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const { selectedLocationId } = useProviderPortal();
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const manualCardEnabled = useFeatureFlag("payment_manual_card");

  const [products, setProducts] = useState<WalkInProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "yoco" | "paycloud" | "paystack_terminal" | "card" | "eft" | "other"
  >("cash");
  const [yocoOpen, setYocoOpen] = useState(false);
  const [paycloudOpen, setPaycloudOpen] = useState(false);
  const [paycloudOrderId, setPaycloudOrderId] = useState<string | null>(null);

  const walkInTaxRate = 0;

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcher.get<{ data: { products: WalkInProduct[] } }>(
        "/api/provider/products?limit=200",
      );
      setProducts(res?.data?.products ?? []);
    } catch {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadProducts();
    setCart([]);
    setQuery("");
    setPaymentMethod("cash");
  }, [open, loadProducts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 20);
  }, [products, query]);

  const { subtotal, taxAmount, grandTotal } = useMemo(
    () => cartTotals(cart, walkInTaxRate),
    [cart, walkInTaxRate],
  );

  const addToCart = (product: WalkInProduct) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, qty: Math.min(c.qty + 1, product.quantity || 999) } : c,
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const adjustQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.product.id !== productId) return c;
          const next = c.qty + delta;
          if (next <= 0) return null;
          return { ...c, qty: next };
        })
        .filter(Boolean) as CartLine[],
    );
  };

  const buildPayload = (overrides?: {
    payment_method?: "cash" | "yoco" | "paycloud" | "paystack_terminal" | "card" | "eft" | "other";
    payment_reference?: string;
    finalize_paycloud_order_id?: string;
  }) => ({
    items: cart.map((c) => ({
      product_id: c.product.id,
      quantity: c.qty,
    })),
    payment_method: overrides?.payment_method ?? paymentMethod,
    payment_reference: overrides?.payment_reference,
    finalize_paycloud_order_id: overrides?.finalize_paycloud_order_id,
    location_id: selectedLocationId || undefined,
  });

  const submitSale = async (
    paymentReference?: string,
    finalizePaycloudOrderId?: string,
  ) => {
    const res = await fetcher.post<{
      data?: { order?: { id?: string; order_number: string } };
      error?: string;
    }>(
      "/api/provider/product-sales",
      buildPayload({
        payment_reference: paymentReference,
        finalize_paycloud_order_id: finalizePaycloudOrderId,
      }),
    );
    if (res?.data?.order) {
      toast.success(`Sale ${res.data.order.order_number} complete`);
      setCart([]);
      onSuccess?.();
      onOpenChange(false);
      if (res.data.order.id) {
        openProductOrderView(res.data.order.id);
      }
      return true;
    }
    toast.error(res?.error ?? "Sale failed");
    return false;
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || processing) return;
    if (paymentMethod === "yoco") {
      setYocoOpen(true);
      return;
    }
    if (paymentMethod === "paycloud") {
      setProcessing(true);
      try {
        const res = await fetcher.post<{
          data?: { order?: { id: string } };
          error?: string;
        }>("/api/provider/product-sales", buildPayload({ payment_method: "paycloud" }));
        const id = res?.data?.order?.id;
        if (!id) {
          toast.error(res?.error ?? "Failed to prepare card sale");
          return;
        }
        setPaycloudOrderId(id);
        setPaycloudOpen(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to prepare card sale");
      } finally {
        setProcessing(false);
      }
      return;
    }
    setProcessing(true);
    try {
      await submitSale();
    } finally {
      setProcessing(false);
    }
  };

  const header = (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold text-gray-900">Walk-in sale</h2>
        <p className="text-xs text-gray-500">Quick in-store product checkout</p>
      </div>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="p-2 -mr-2 rounded-full touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );

  return (
    <>
      <BookingBottomSheet open={open} onOpenChange={onOpenChange} mode="create" header={header}>
        <div className="space-y-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="pl-9 min-h-[44px]"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <BookingSectionCard>
              <BookingSectionLabel className="mb-2">Products</BookingSectionLabel>
              <ul className="space-y-2 max-h-40 overflow-y-auto">
                {filtered.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{p.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-gray-600">{formatMoney(p.retail_price)}</span>
                      <button
                        type="button"
                        className="p-1 rounded-lg border min-h-[32px] min-w-[32px]"
                        onClick={() => addToCart(p)}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </BookingSectionCard>
          )}

          <BookingSectionCard>
            <BookingSectionLabel className="mb-2 flex items-center gap-1.5">
              <ShoppingCart className="h-4 w-4" />
              Cart ({cart.length})
            </BookingSectionLabel>
            {cart.length === 0 ? (
              <p className="text-sm text-gray-500">Add products to cart</p>
            ) : (
              <ul className="space-y-2">
                {cart.map((line) => (
                  <li key={line.product.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{line.product.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => adjustQty(line.product.id, -1)} className="p-1">
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center">{line.qty}</span>
                      <button type="button" onClick={() => adjustQty(line.product.id, 1)} className="p-1">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {cart.length > 0 ? (
              <>
                <BookingSummaryRow label="Subtotal" value={formatMoney(subtotal)} />
                {taxAmount > 0 ? (
                  <BookingSummaryRow label="Tax" value={formatMoney(taxAmount)} />
                ) : null}
                <BookingSummaryRow label="Total" value={formatMoney(grandTotal)} emphasize />
              </>
            ) : null}
          </BookingSectionCard>

          {cart.length > 0 ? (
            <BookingSectionCard>
              <BookingSectionLabel className="mb-2">Payment</BookingSectionLabel>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: "cash" as const, label: "Cash" },
                    ...(manualCardEnabled ? [{ id: "card" as const, label: "Card taken" }] : []),
                    { id: "eft" as const, label: "EFT" },
                    { id: "other" as const, label: "Other" },
                    ...(yocoEnabled ? [{ id: "yoco" as const, label: "Yoco" }] : []),
                    ...(paycloudEnabled ? [{ id: "paycloud" as const, label: "Card machine" }] : []),
                    ...(paystackTerminalEnabled
                      ? [{ id: "paystack_terminal" as const, label: "Paystack Terminal" }]
                      : []),
                  ] as const
                ).map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setPaymentMethod(method.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold border min-h-[36px] ${
                        paymentMethod === method.id
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-700 border-gray-200"
                      }`}
                    >
                      {method.label}
                    </button>
                  ))}
              </div>
              <BookingActionButton
                className="mt-3"
                disabled={processing}
                onClick={() => void handleCheckout()}
              >
                {processing ? "Processing…" : `Complete sale · ${formatMoney(grandTotal)}`}
              </BookingActionButton>
            </BookingSectionCard>
          ) : null}
        </div>
      </BookingBottomSheet>

      {yocoOpen ? (
        <YocoPaymentDialog
          open={yocoOpen}
          onOpenChange={setYocoOpen}
          amount={grandTotal}
          onSuccess={async (payment) => {
            setYocoOpen(false);
            setProcessing(true);
            try {
              await submitSale(payment.yoco_payment_id);
            } finally {
              setProcessing(false);
            }
          }}
        />
      ) : null}

      {paycloudOpen && paycloudOrderId ? (
        <PayCloudPaymentDialog
          open={paycloudOpen}
          onOpenChange={setPaycloudOpen}
          amount={grandTotal}
          entityType="product_order"
          entityId={paycloudOrderId}
          bookingLocationId={selectedLocationId}
          onSuccess={async () => {
            setPaycloudOpen(false);
            setProcessing(true);
            try {
              await submitSale(undefined, paycloudOrderId);
            } finally {
              setProcessing(false);
              setPaycloudOrderId(null);
            }
          }}
        />
      ) : null}
    </>
  );
}
