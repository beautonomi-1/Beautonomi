"use client";
import { useTranslation } from "@beautonomi/i18n";

import { useEffect, useMemo, useState } from "react";
import { Plus, Minus } from "lucide-react";
import type { BookingEditProductLine } from "@beautonomi/provider-booking";
import {
  productCartLineKey,
  resolveProductLineUnitPrice,
  stockLimitForCatalogProduct,
} from "@beautonomi/provider-booking";
import { providerApi } from "@/lib/provider-portal/api";
import type { ProductItem, ProductVariantItem } from "@/lib/provider-portal/types";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingSectionCard, BookingSectionLabel, BookingActionButton } from "../ui";

interface EditProductsSectionProps {
  products: BookingEditProductLine[];
  onChange: (next: BookingEditProductLine[]) => void;
}

function variantLabel(variant: ProductVariantItem, fallback: string): string {
  const values = Object.values(variant.option_values ?? {});
  return values.length > 0 ? values.join(" / ") : variant.sku ?? fallback;
}

export function EditProductsSection({ products, onChange }: EditProductsSectionProps) {
  const { t } = useTranslation();
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

    const unitPrice = resolveProductLineUnitPrice(p, variant?.id ?? null);
    const maxStock = stockLimitForCatalogProduct(p, variant);
    if (maxStock === 0) return;

    const key = productCartLineKey(p.id, variant?.id);
    const existing = products.find(
      (x) => productCartLineKey(x.productId, x.productVariantId) === key,
    );

    if (existing) {
      const nextQty =
        maxStock == null ? existing.quantity + 1 : Math.min(existing.quantity + 1, maxStock);
      onChange(
        products.map((x) =>
          productCartLineKey(x.productId, x.productVariantId) === key
            ? { ...x, quantity: nextQty, unitPrice, maxStock }
            : x,
        ),
      );
    } else {
      onChange([
        ...products,
        {
          productId: p.id,
          productName: p.name,
          productVariantId: variant?.id ?? null,
          productVariantName: variant
            ? variantLabel(variant, t("web.provider.portal.appointmentCreate.variantFallback"))
            : null,
          quantity: 1,
          unitPrice,
          maxStock,
        },
      ]);
    }
    setPickId("");
    setPickVariantId("");
  };

  const updateQty = (productId: string, variantId: string | null | undefined, delta: number) => {
    const key = productCartLineKey(productId, variantId);
    const catalogProduct = catalog.find((c) => c.id === productId);
    const variant = catalogProduct?.variants?.find((v) => v.id === variantId) ?? null;
    const maxStock = catalogProduct ? stockLimitForCatalogProduct(catalogProduct, variant) : null;

    onChange(
      products
        .map((p) => {
          if (productCartLineKey(p.productId, p.productVariantId) !== key) return p;
          const nextRaw = p.quantity + delta;
          const qty =
            maxStock == null ? Math.max(0, nextRaw) : Math.max(0, Math.min(nextRaw, maxStock));
          return { ...p, quantity: qty, maxStock };
        })
        .filter((p) => p.quantity > 0),
    );
  };

  const removeProduct = (productId: string, variantId?: string | null) => {
    const key = productCartLineKey(productId, variantId);
    onChange(
      products.filter((x) => productCartLineKey(x.productId, x.productVariantId) !== key),
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
      return stockLimitForCatalogProduct(selectedProduct, variant) !== 0;
    })();

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-2">{t("web.editProducts.label")}</BookingSectionLabel>
      {products.length > 0 ? (
        <ul className="space-y-2 mb-3">
          {products.map((p) => {
            const lineKey = productCartLineKey(p.productId, p.productVariantId);
            const label = p.productVariantName
              ? `${p.productName} · ${p.productVariantName}`
              : p.productName;
            return (
              <li key={lineKey} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{label}</p>
                  <p className="text-xs text-gray-500">
                    {t("web.editProducts.each", { price: formatMoney(p.unitPrice) })}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    className="p-2 rounded-lg border touch-manipulation min-h-[36px] min-w-[36px]"
                    onClick={() => updateQty(p.productId, p.productVariantId, -1)}
                    aria-label={t("web.editProducts.decreaseQty")}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center tabular-nums">{p.quantity}</span>
                  <button
                    type="button"
                    className="p-2 rounded-lg border touch-manipulation min-h-[36px] min-w-[36px]"
                    onClick={() => updateQty(p.productId, p.productVariantId, 1)}
                    aria-label={t("web.editProducts.increaseQty")}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-600 underline ms-1"
                    onClick={() => removeProduct(p.productId, p.productVariantId)}
                  >
                    {t("web.promoSection.remove")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 mb-3">{t("web.editProducts.empty")}</p>
      )}

      <div className="flex flex-col gap-2">
        <Select value={pickId} onValueChange={(v) => {
          setPickId(v);
          setPickVariantId("");
        }}>
          <SelectTrigger className="rounded-xl min-h-[44px]">
            <SelectValue placeholder={t("web.editProducts.addProduct")} />
          </SelectTrigger>
          <SelectContent>
            {catalog.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · {formatMoney(Number(p.retail_price ?? 0))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {variantOptions.length > 0 ? (
          <Select value={pickVariantId} onValueChange={setPickVariantId}>
            <SelectTrigger className="rounded-xl min-h-[44px]">
              <SelectValue placeholder={t("web.provider.portal.appointmentCreate.selectVariant")} />
            </SelectTrigger>
            <SelectContent>
              {variantOptions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {variantLabel(v, t("web.provider.portal.appointmentCreate.variantFallback"))} ·{" "}
                  {formatMoney(Number(v.retail_price ?? 0))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <BookingActionButton
          type="button"
          variant="outline"
          fullWidth={false}
          disabled={!canAdd}
          onClick={addProduct}
        >
          <Plus className="h-4 w-4" />
        </BookingActionButton>
      </div>
    </BookingSectionCard>
  );
}
