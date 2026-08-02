"use client";

import type { Appointment } from "@/lib/provider-portal/types";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { ShoppingBag } from "lucide-react";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

type ProductLine = {
  product_name?: string;
  productName?: string;
  product_variant_name?: string;
  productVariantName?: string;
  quantity?: number;
  unit_price?: number;
  unitPrice?: number;
  total_price?: number;
  totalPrice?: number;
};

interface BookingProductsSectionProps {
  appointment: Appointment;
}

export function BookingProductsSection({ appointment }: BookingProductsSectionProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const raw = appointment as unknown as Record<string, unknown>;
  const lines = (raw.products as ProductLine[] | undefined) ?? [];

  if (lines.length === 0) return null;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-3 flex items-center gap-1.5">
        <ShoppingBag className="h-4 w-4" />
        Products
      </BookingSectionLabel>
      <ul className="space-y-2 text-sm">
        {lines.map((line, index) => {
          const name = line.product_name ?? line.productName ?? "Product";
          const variant = line.product_variant_name ?? line.productVariantName;
          const label = variant ? `${name} · ${variant}` : name;
          const qty = Number(line.quantity ?? 1);
          const total = Number(
            line.total_price ?? line.totalPrice ??
              (Number(line.unit_price ?? line.unitPrice ?? 0) * qty),
          );
          return (
            <li key={index} className="flex justify-between gap-2">
              <span className="truncate">
                {label} ×{qty}
              </span>
              <span className="font-medium shrink-0">{formatMoney(total)}</span>
            </li>
          );
        })}
      </ul>
    </BookingSectionCard>
  );
}
