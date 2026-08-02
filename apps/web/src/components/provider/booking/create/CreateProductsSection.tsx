"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Minus, ShoppingBag } from "lucide-react";
import { providerApi } from "@/lib/provider-portal/api";
import type { ProductItem, ProductVariantItem } from "@/lib/provider-portal/types";
import type { AppointmentProduct } from "@/components/appointments/types";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { BookingSectionCard, BookingSectionLabel, BookingActionButton } from "../ui";

interface CreateProductsSectionProps {
  products: AppointmentProduct[];
  onChange: (next: AppointmentProduct[]) => void;
}

function stockLimitForLine(product: ProductItem, variant?: ProductVariantItem | null): number | null {
  if (product.track_stock_quantity === false) return null;
  const raw = variant ? variant.quantity : product.quantity;
  const stock = Number(raw ?? 0);
  return Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0;
}

function variantLabel(variant: ProductVariantItem): string {
  const values = Object.values(variant.option_values ?? {});
  return values.length > 0 ? values.join(" / ") : variant.sku ?? "Variant";
}

function lineKey(productId: string, variantId?: string | null) {
  return `${productId}:${variantId ?? ""}`;
}

export function CreateProductsSection({ products, onChange }: CreateProductsSectionProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const [catalog, setCatalog] = useState<ProductItem[]>([]);
  const [pickId, setPickId] = useState("");
  const [pickVariantId, setPickVariantId] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await providerApi.listProducts(undefined, { page: 1, limit: 200 });
        if (cancelled) return;
        setCatalog(
          res.data.filter((p) => p.is_active !== false && p.retail_sales_enabled !== false),
        );
      } catch {
        if (!cancelled) setCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProduct = useMemo(
    () => catalog.find((c) => c.id === pickId),
    [catalog, pickId],
  );

  const variantOptions = useMemo(() => {
    if (!selectedProduct?.has_variants || !selectedProduct.variants?.length) return [];
    return selectedProduct.variants;
  }, [selectedProduct]);

  useEffect(() => {
    if (variantOptions.length === 1) {
      setPickVariantId(variantOptions[0]!.id);
    } else if (variantOptions.length === 0) {
      setPickVariantId("");
    }
  }, [pickId, variantOptions]);

  const addProduct = () => {
    const p = selectedProduct;
    if (!p) return;

    const variant =
      variantOptions.length > 0
        ? variantOptions.find((v) => v.id === pickVariantId) ?? null
        : null;

    if (variantOptions.length > 0 && !variant) return;

    const unitPrice = Number(variant?.retail_price ?? p.retail_price ?? 0);
    const maxStock = stockLimitForLine(p, variant);
    if (maxStock === 0) return;

    const key = lineKey(p.id, variant?.id);
    const existing = products.find(
      (x) => lineKey(x.productId, x.productVariantId) === key,
    );

    if (existing) {
      const nextQty =
        maxStock == null ? existing.quantity + 1 : Math.min(existing.quantity + 1, maxStock);
      onChange(
        products.map((x) =>
          lineKey(x.productId, x.productVariantId) === key
            ? { ...x, quantity: nextQty, totalPrice: nextQty * x.unitPrice }
            : x,
        ),
      );
    } else {
      onChange([
        ...products,
        {
          id: `prod-${Date.now()}`,
          productId: p.id,
          productName: p.name,
          productVariantId: variant?.id ?? null,
          productVariantName: variant ? variantLabel(variant) : null,
          quantity: 1,
          unitPrice,
          totalPrice: unitPrice,
        },
      ]);
    }
    setPickId("");
    setPickVariantId("");
  };

  const updateQty = (productId: string, variantId: string | null | undefined, delta: number) => {
    const key = lineKey(productId, variantId);
    const catalogProduct = catalog.find((c) => c.id === productId);
    const variant = catalogProduct?.variants?.find((v) => v.id === variantId) ?? null;
    const maxStock = catalogProduct ? stockLimitForLine(catalogProduct, variant) : null;

    onChange(
      products
        .map((p) => {
          if (lineKey(p.productId, p.productVariantId) !== key) return p;
          const nextRaw = p.quantity + delta;
          const qty =
            maxStock == null ? Math.max(0, nextRaw) : Math.max(0, Math.min(nextRaw, maxStock));
          return { ...p, quantity: qty, totalPrice: qty * p.unitPrice };
        })
        .filter((p) => p.quantity > 0),
    );
  };

  const canAdd =
    Boolean(pickId) &&
    (variantOptions.length === 0 || Boolean(pickVariantId)) &&
    (() => {
      if (!selectedProduct) return false;
      const variant =
        variantOptions.length > 0
          ? variantOptions.find((v) => v.id === pickVariantId)
          : null;
      return stockLimitForLine(selectedProduct, variant) !== 0;
    })();

  if (catalog.length === 0) return null;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-2 flex items-center gap-1.5">
        <ShoppingBag className="h-4 w-4" />
        Retail products
      </BookingSectionLabel>
      <div className="flex flex-col gap-2 mb-3">
        <select
          value={pickId}
          onChange={(e) => {
            setPickId(e.target.value);
            setPickVariantId("");
          }}
          className="w-full rounded-xl border px-3 min-h-[44px] text-sm"
        >
          <option value="">Select product…</option>
          {catalog.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {formatMoney(Number(p.retail_price ?? 0))}
            </option>
          ))}
        </select>
        {variantOptions.length > 0 ? (
          <select
            value={pickVariantId}
            onChange={(e) => setPickVariantId(e.target.value)}
            className="w-full rounded-xl border px-3 min-h-[44px] text-sm"
          >
            <option value="">Select variant…</option>
            {variantOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {variantLabel(v)} · {formatMoney(Number(v.retail_price ?? 0))}
              </option>
            ))}
          </select>
        ) : null}
        <BookingActionButton fullWidth={false} size="sm" disabled={!canAdd} onClick={addProduct}>
          Add
        </BookingActionButton>
      </div>
      {products.length > 0 ? (
        <ul className="space-y-2">
          {products.map((p) => {
            const label = p.productVariantName
              ? `${p.productName} · ${p.productVariantName}`
              : p.productName;
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate flex-1">{label}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    className="p-2 touch-manipulation"
                    onClick={() => updateQty(p.productId, p.productVariantId, -1)}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-6 text-center">{p.quantity}</span>
                  <button
                    type="button"
                    className="p-2 touch-manipulation"
                    onClick={() => updateQty(p.productId, p.productVariantId, 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <span className="w-16 text-right">{formatMoney(p.totalPrice)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </BookingSectionCard>
  );
}
