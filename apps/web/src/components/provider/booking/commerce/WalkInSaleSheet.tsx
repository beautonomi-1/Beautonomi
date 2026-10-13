"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Minus, Plus, Search, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { openProductOrderView } from "@/stores/appointment-sidebar-store";
import { percentOf, sumMoney } from "@beautonomi/utils";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { useTranslation } from "@beautonomi/i18n";
import { Input } from "@/components/ui/input";
import {
  BookingBottomSheet,
  BookingActionButton,
  BookingSectionCard,
  BookingSectionLabel,
  BookingSummaryRow,
} from "../ui";

const CardMachineCollectDialog = dynamic(
  () =>
    import("@/components/provider-portal/CardMachineCollectDialog").then((m) => ({
      default: m.CardMachineCollectDialog,
    })),
  { ssr: false },
);

interface WalkInVariant {
  id: string;
  variant_name: string;
  retail_price: number;
  quantity: number;
  sku?: string | null;
}

interface WalkInProduct {
  id: string;
  name: string;
  retail_price: number;
  tax_rate: number;
  quantity: number;
  effective_quantity: number;
  has_variants: boolean;
  variants: WalkInVariant[];
  track_stock_quantity?: boolean;
  retail_sales_enabled?: boolean;
  is_active?: boolean;
}

interface CartLine {
  product: WalkInProduct;
  qty: number;
  variantId?: string;
  variantName?: string;
  unitPrice: number;
  availableQty: number;
}

interface WalkInSaleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function cartLineKey(productId: string, variantId?: string) {
  return variantId ? `${productId}::${variantId}` : productId;
}

function cartTotals(cart: CartLine[], taxRate: number) {
  const subtotal = sumMoney(...cart.map((c) => c.unitPrice * c.qty));
  const taxAmount = percentOf(subtotal, taxRate);
  return { subtotal, taxAmount, grandTotal: subtotal + taxAmount };
}

export function WalkInSaleSheet({ open, onOpenChange, onSuccess }: WalkInSaleSheetProps) {
  const { t } = useTranslation();
  const { format: formatMoney } = useProviderMoneyFormat();
  const { selectedLocationId } = useProviderPortal();
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const manualCardEnabled = useFeatureFlag("payment_manual_card");

  const [products, setProducts] = useState<WalkInProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [walkInTaxRate, setWalkInTaxRate] = useState(0);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [variantPickerProduct, setVariantPickerProduct] = useState<WalkInProduct | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "card_machine" | "paystack_terminal" | "card" | "eft" | "other"
  >("cash");
  const [cardMachineOpen, setCardMachineOpen] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const cardMachineEnabled = yocoEnabled || paycloudEnabled;

  useEffect(() => {
    setPendingOrderId(null);
  }, [cart]);

  const fetchTaxSettings = useCallback(async () => {
    try {
      const res = await fetcher.get<{
        data?: { tax_rate_percent?: number; is_vat_registered?: boolean };
        tax_rate_percent?: number;
        is_vat_registered?: boolean;
      }>("/api/provider/settings/sales/taxes");
      const raw = (res as { data?: { tax_rate_percent?: number; is_vat_registered?: boolean } })?.data ?? res;
      setWalkInTaxRate(raw?.is_vat_registered ? Number(raw.tax_rate_percent || 0) : 0);
    } catch {
      setWalkInTaxRate(0);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcher.get<{ data: { products: WalkInProduct[] } }>(
        "/api/provider/products?limit=200",
      );
      const rows = res?.data?.products ?? [];
      setProducts(
        rows
          .filter(
            (p) =>
              p.is_active !== false &&
              p.retail_sales_enabled !== false &&
              (p.track_stock_quantity === false || (p.effective_quantity ?? p.quantity) > 0),
          )
          .map((p) => ({
            ...p,
            retail_price: Number(p.retail_price),
            effective_quantity: Number(p.effective_quantity ?? p.quantity),
            has_variants: Boolean(p.has_variants && (p.variants?.length ?? 0) > 0),
            variants: (p.variants || []).map((v) => ({
              id: v.id,
              variant_name: v.variant_name || t("web.provider.ecommerceWalkIn.variant"),
              retail_price: Number(v.retail_price ?? p.retail_price),
              quantity: Number(v.quantity ?? 0),
              sku: v.sku ?? null,
            })),
          })),
      );
    } catch {
      toast.error(t("web.provider.bookings.walkInSale.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!open) return;
    void loadProducts();
    void fetchTaxSettings();
    setCart([]);
    setQuery("");
    setPaymentMethod("cash");
    setVariantPickerProduct(null);
  }, [open, loadProducts, fetchTaxSettings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 20);
  }, [products, query]);

  const { subtotal, taxAmount, grandTotal } = useMemo(
    () => cartTotals(cart, walkInTaxRate),
    [cart, walkInTaxRate],
  );

  const addToCart = useCallback((product: WalkInProduct, variant?: WalkInVariant) => {
    const key = cartLineKey(product.id, variant?.id);
    const unitPrice = variant ? variant.retail_price : product.retail_price;
    const untracked = product.track_stock_quantity === false;
    const availableQty = untracked
      ? 99_999
      : variant
        ? variant.quantity
        : (product.effective_quantity ?? product.quantity);

    setCart((prev) => {
      const existing = prev.find((c) => cartLineKey(c.product.id, c.variantId) === key);
      if (existing) {
        if (existing.qty >= availableQty) return prev;
        return prev.map((c) =>
          cartLineKey(c.product.id, c.variantId) === key ? { ...c, qty: c.qty + 1 } : c,
        );
      }
      return [
        ...prev,
        {
          product,
          qty: 1,
          variantId: variant?.id,
          variantName: variant?.variant_name,
          unitPrice,
          availableQty,
        },
      ];
    });
  }, []);

  const handleProductClick = (product: WalkInProduct) => {
    if (product.has_variants && product.variants.length > 0) {
      setVariantPickerProduct(product);
    } else {
      addToCart(product);
    }
  };

  const adjustQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (cartLineKey(c.product.id, c.variantId) !== key) return c;
          const next = c.qty + delta;
          if (next <= 0) return null;
          if (next > c.availableQty) return c;
          return { ...c, qty: next };
        })
        .filter(Boolean) as CartLine[],
    );
  };

  const buildPayload = (overrides?: {
    payment_method?:
      | "cash"
      | "yoco"
      | "paycloud"
      | "paystack_terminal"
      | "card"
      | "card_machine"
      | "eft"
      | "other";
    payment_reference?: string;
    finalize_paycloud_order_id?: string;
  }) => ({
    items: cart.map((c) => ({
      product_id: c.product.id,
      quantity: c.qty,
      ...(c.variantId ? { product_variant_id: c.variantId } : {}),
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
      toast.success(t("web.provider.bookings.walkInSale.saleComplete", { number: res.data.order.order_number }));
      setCart([]);
      onSuccess?.();
      onOpenChange(false);
      if (res.data.order.id) {
        openProductOrderView(res.data.order.id);
      }
      return true;
    }
    toast.error(res?.error ?? t("web.provider.bookings.walkInSale.saleFailed"));
    return false;
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || processing) return;
    if (paymentMethod === "card_machine" && pendingOrderId) {
      setProcessing(true);
      try {
        await submitSale(undefined, pendingOrderId);
      } catch (err) {
        if (err instanceof FetchError && err.code === "PAYMENT_NOT_SETTLED") {
          setCardMachineOpen(true);
        } else {
          toast.error(err instanceof Error ? err.message : t("web.provider.bookings.walkInSale.saleFailed"));
        }
      } finally {
        setProcessing(false);
      }
      return;
    }
    if (paymentMethod === "card_machine") {
      setProcessing(true);
      try {
        const res = await fetcher.post<{
          data?: { order?: { id: string } };
          error?: string;
        }>("/api/provider/product-sales", buildPayload({ payment_method: "card_machine" }));
        const id = res?.data?.order?.id;
        if (!id) {
          toast.error(res?.error ?? t("web.provider.bookings.walkInSale.prepareFailed"));
          return;
        }
        setPendingOrderId(id);
        setCardMachineOpen(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("web.provider.bookings.walkInSale.prepareFailed"));
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
        <h2 className="text-lg font-semibold text-gray-900">{t("web.provider.bookings.walkInSale.title")}</h2>
        <p className="text-xs text-gray-500">{t("web.provider.bookings.walkInSale.subtitle")}</p>
      </div>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="p-2 -me-2 rounded-full touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={t("common.close")}
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
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("web.provider.bookings.walkInSale.searchPlaceholder")}
              className="ps-9 min-h-[44px]"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <BookingSectionCard>
              <BookingSectionLabel className="mb-2">{t("web.provider.bookings.walkInSale.products")}</BookingSectionLabel>
              <ul className="space-y-2 max-h-40 overflow-y-auto">
                {filtered.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{p.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-gray-600">
                        {p.has_variants && p.variants.length > 0
                          ? t("web.provider.ecommerceWalkIn.fromPrice", {
                              price: formatMoney(Math.min(...p.variants.map((v) => v.retail_price))),
                            })
                          : formatMoney(p.retail_price)}
                      </span>
                      <button
                        type="button"
                        className="p-1 rounded-lg border min-h-[32px] min-w-[32px]"
                        onClick={() => handleProductClick(p)}
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
              {t("web.provider.bookings.walkInSale.cartCount", { count: cart.length })}
            </BookingSectionLabel>
            {cart.length === 0 ? (
              <p className="text-sm text-gray-500">{t("web.provider.bookings.walkInSale.addToCart")}</p>
            ) : (
              <ul className="space-y-2">
                {cart.map((line) => {
                  const key = cartLineKey(line.product.id, line.variantId);
                  return (
                    <li key={key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        {line.product.name}
                        {line.variantName ? ` · ${line.variantName}` : ""}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => adjustQty(key, -1)} className="p-1">
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-6 text-center">{line.qty}</span>
                        <button type="button" onClick={() => adjustQty(key, 1)} className="p-1">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {cart.length > 0 ? (
              <>
                <BookingSummaryRow label={t("web.provider.bookings.walkInSale.subtotal")} value={formatMoney(subtotal)} />
                {taxAmount > 0 ? (
                  <BookingSummaryRow label={t("web.provider.bookings.walkInSale.tax")} value={formatMoney(taxAmount)} />
                ) : null}
                <BookingSummaryRow label={t("web.provider.bookings.walkInSale.total")} value={formatMoney(grandTotal)} emphasize />
              </>
            ) : null}
          </BookingSectionCard>

          {cart.length > 0 ? (
            <BookingSectionCard>
              <BookingSectionLabel className="mb-2">{t("web.provider.bookings.walkInSale.payment")}</BookingSectionLabel>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: "cash" as const, label: t("web.provider.bookings.walkInSale.cash") },
                    ...(manualCardEnabled ? [{ id: "card" as const, label: t("web.provider.bookings.walkInSale.cardTaken") }] : []),
                    { id: "eft" as const, label: t("web.provider.bookings.walkInSale.eft") },
                    { id: "other" as const, label: t("web.provider.bookings.walkInSale.other") },
                    ...(cardMachineEnabled
                      ? [{ id: "card_machine" as const, label: t("web.provider.bookings.walkInSale.cardMachine") }]
                      : []),
                    ...(paystackTerminalEnabled
                      ? [{ id: "paystack_terminal" as const, label: t("web.provider.bookings.walkInSale.paystackTerminal") }]
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
                {processing
                  ? t("web.provider.bookings.walkInSale.processing")
                  : t("web.provider.bookings.walkInSale.completeSale", { amount: formatMoney(grandTotal) })}
              </BookingActionButton>
            </BookingSectionCard>
          ) : null}
        </div>
      </BookingBottomSheet>

      {variantPickerProduct ? (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 className="font-bold text-gray-900">{variantPickerProduct.name}</h3>
              <button type="button" onClick={() => setVariantPickerProduct(null)} className="rounded-full p-1">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <p className="mb-3 text-xs text-gray-500">{t("web.provider.ecommerceWalkIn.chooseVariant")}</p>
            <div className="space-y-2">
              {variantPickerProduct.variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  disabled={v.quantity <= 0 && variantPickerProduct.track_stock_quantity !== false}
                  onClick={() => {
                    addToCart(variantPickerProduct, v);
                    setVariantPickerProduct(null);
                  }}
                  className="w-full flex items-center justify-between rounded-xl border-2 border-gray-200 p-3 text-start hover:border-pink-300 disabled:opacity-50"
                >
                  <span className="text-sm font-semibold">{v.variant_name}</span>
                  <span className="font-bold text-pink-600">{formatMoney(v.retail_price)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {pendingOrderId ? (
        <CardMachineCollectDialog
          open={cardMachineOpen}
          onOpenChange={setCardMachineOpen}
          amount={grandTotal}
          autoStart
          entity={{
            entityType: "product_order",
            entityId: pendingOrderId,
            productOrderId: pendingOrderId,
            bookingLocationId: selectedLocationId,
          }}
          onSuccess={async () => {
            setCardMachineOpen(false);
            setProcessing(true);
            try {
              await submitSale(undefined, pendingOrderId);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : t("web.provider.bookings.walkInSale.saleFailed"));
            } finally {
              setProcessing(false);
            }
          }}
        />
      ) : null}
    </>
  );
}
