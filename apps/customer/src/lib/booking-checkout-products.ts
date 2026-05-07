/** Variant slice used when displaying booking-checkout retail lines (matches API transform). */
export type CheckoutProductVariant = {
  id: string;
  retail_price: number;
  quantity: number;
  option_values?: Record<string, string>;
  sort_order?: number;
};

export function variantOptionTypeLabel(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "name" in raw && typeof (raw as { name: unknown }).name === "string") {
    return (raw as { name: string }).name;
  }
  return "";
}

export function labelForVariantOptionValues(option_values?: Record<string, string>): string {
  if (!option_values || typeof option_values !== "object") return "";
  return Object.values(option_values)
    .filter((x) => Boolean(x && String(x).trim()))
    .join(" / ");
}

/** Cart / summary label: `Product — Size / Color` when a variant is selected. */
export function bookingCheckoutLineDisplayName(
  productName: string,
  variantId: string | null | undefined,
  variants: CheckoutProductVariant[] | undefined,
): string {
  if (!variantId || !variants?.length) return productName;
  const v = variants.find((x) => x.id === variantId);
  const sub = v ? labelForVariantOptionValues(v.option_values) : "";
  return sub ? `${productName} — ${sub}` : productName;
}
