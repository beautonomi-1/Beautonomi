"use client";

import { useEffect, useState } from "react";
import { Plus, Minus } from "lucide-react";
import type { BookingEditProductLine } from "@beautonomi/provider-booking";
import { providerApi } from "@/lib/provider-portal/api";
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

export function EditProductsSection({ products, onChange }: EditProductsSectionProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const [catalog, setCatalog] = useState<
    Array<{ id: string; name: string; price: number; stock: number | null }>
  >([]);
  const [pickId, setPickId] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await providerApi.listProducts(undefined, { page: 1, limit: 200 });
        if (cancelled) return;
        setCatalog(
          res.data
            .filter((p) => p.is_active !== false && p.retail_sales_enabled !== false)
            .map((p) => ({
              id: p.id,
              name: p.name,
              price: Number(p.retail_price ?? 0),
              stock: p.quantity ?? null,
            })),
        );
      } catch {
        if (!cancelled) setCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addProduct = () => {
    const p = catalog.find((c) => c.id === pickId);
    if (!p) return;
    const existing = products.find((x) => x.productId === p.id);
    if (existing) {
      onChange(
        products.map((x) =>
          x.productId === p.id ? { ...x, quantity: x.quantity + 1 } : x,
        ),
      );
    } else {
      onChange([
        ...products,
        {
          productId: p.id,
          productName: p.name,
          quantity: 1,
          unitPrice: p.price,
          maxStock: p.stock,
        },
      ]);
    }
    setPickId("");
  };

  const updateQty = (productId: string, delta: number) => {
    onChange(
      products
        .map((x) => {
          if (x.productId !== productId) return x;
          const nextQty = Math.max(1, x.quantity + delta);
          return { ...x, quantity: nextQty };
        })
        .filter((x) => x.quantity > 0),
    );
  };

  const removeProduct = (productId: string) => {
    onChange(products.filter((x) => x.productId !== productId));
  };

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-2">Products</BookingSectionLabel>
      {products.length > 0 ? (
        <ul className="space-y-2 mb-3">
          {products.map((p) => (
            <li key={p.productId} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{p.productVariantName ?? p.productName}</p>
                <p className="text-xs text-gray-500">{formatMoney(p.unitPrice)} each</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className="p-2 rounded-lg border touch-manipulation min-h-[36px] min-w-[36px]"
                  onClick={() => updateQty(p.productId, -1)}
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-6 text-center tabular-nums">{p.quantity}</span>
                <button
                  type="button"
                  className="p-2 rounded-lg border touch-manipulation min-h-[36px] min-w-[36px]"
                  onClick={() => updateQty(p.productId, 1)}
                  aria-label="Increase quantity"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="text-xs text-red-600 underline ml-1"
                  onClick={() => removeProduct(p.productId)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 mb-3">No products on this booking.</p>
      )}

      <div className="flex gap-2">
        <Select value={pickId} onValueChange={setPickId}>
          <SelectTrigger className="rounded-xl min-h-[44px] flex-1">
            <SelectValue placeholder="Add product" />
          </SelectTrigger>
          <SelectContent>
            {catalog.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · {formatMoney(p.price)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <BookingActionButton
          type="button"
          variant="outline"
          fullWidth={false}
          disabled={!pickId}
          onClick={addProduct}
        >
          <Plus className="h-4 w-4" />
        </BookingActionButton>
      </div>
    </BookingSectionCard>
  );
}
