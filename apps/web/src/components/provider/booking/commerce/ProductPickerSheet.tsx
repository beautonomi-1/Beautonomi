"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ServiceItem } from "@/lib/provider-portal/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { providerApi } from "@/lib/provider-portal/api";
import {
  BookingBottomSheet,
  BookingActionButton,
  BookingSectionCard,
  BookingSectionLabel,
} from "../ui";

export interface ProductPickerItem {
  id: string;
  name: string;
  price: number;
  stock?: number | null;
}

interface ProductPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products?: ProductPickerItem[];
  /** When products is empty, load catalog automatically on open. */
  autoLoadProducts?: boolean;
  onAdd: (productId: string, quantity: number) => Promise<void> | void;
}

export function ProductPickerSheet({
  open,
  onOpenChange,
  products: productsProp = [],
  autoLoadProducts = true,
  onAdd,
}: ProductPickerSheetProps) {
  const [loadedProducts, setLoadedProducts] = useState<ProductPickerItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    if (!open || productsProp.length > 0 || !autoLoadProducts) return;
    let cancelled = false;
    void (async () => {
      setLoadingProducts(true);
      try {
        const res = await providerApi.listProducts(undefined, { page: 1, limit: 200 });
        if (cancelled) return;
        setLoadedProducts(
          res.data.map((p) => ({
            id: p.id,
            name: p.name,
            price: Number(p.retail_price ?? 0),
            stock: p.quantity ?? null,
          })),
        );
      } catch {
        if (!cancelled) setLoadedProducts([]);
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, productsProp.length, autoLoadProducts]);

  const products = productsProp.length > 0 ? productsProp : loadedProducts;
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );

  const handleAdd = async () => {
    const qty = Number(quantity);
    if (!productId || !Number.isFinite(qty) || qty <= 0) {
      toast.error("Select a product and quantity");
      return;
    }
    setSaving(true);
    try {
      await onAdd(productId, qty);
      toast.success("Product added");
      onOpenChange(false);
      setProductId("");
      setQuantity("1");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add product");
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <BookingActionButton disabled={saving || !productId} onClick={handleAdd}>
      {saving ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Adding…
        </>
      ) : (
        "Add product"
      )}
    </BookingActionButton>
  );

  return (
    <BookingBottomSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="edit"
      title="Add product"
      footer={footer}
    >
      <div className="space-y-4 pb-4">
        {loadingProducts ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No retail products in catalog.</p>
        ) : (
        <>
        <BookingSectionCard>
          <BookingSectionLabel className="mb-2">Product</BookingSectionLabel>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="rounded-xl min-h-[44px]">
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.price > 0 ? ` · ${p.price.toFixed(2)}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </BookingSectionCard>

        <BookingSectionCard>
          <BookingSectionLabel htmlFor="product-qty" className="mb-2">
            Quantity
          </BookingSectionLabel>
          <Input
            id="product-qty"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="rounded-xl min-h-[44px]"
          />
          {selected?.stock != null ? (
            <p className="text-xs text-gray-500 mt-1">In stock: {selected.stock}</p>
          ) : null}
        </BookingSectionCard>
        </>
        )}
      </div>
    </BookingBottomSheet>
  );
}

/** Placeholder type export for create-flow product lines */
export type { ServiceItem };
