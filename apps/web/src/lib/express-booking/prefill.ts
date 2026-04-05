import { z } from "zod";

/**
 * Stored on `express_booking_links.prefill` and returned by GET /api/public/express-link/[slug].
 * Validated server-side on write; sanitized on public read.
 */
export const expressPrefillSchema = z.object({
  addon_ids: z.array(z.string().uuid()).max(50).optional(),
  promotion_code: z.string().trim().max(80).optional(),
  gift_card_code: z.string().trim().max(80).optional(),
  product_cart: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(999),
        product_variant_id: z.string().uuid().nullable().optional(),
      })
    )
    .max(30)
    .optional(),
});

export type ExpressPrefill = z.infer<typeof expressPrefillSchema>;

/** Normalize DB / API JSON into a safe prefill object (drops invalid keys). */
export function sanitizeExpressPrefill(raw: unknown): ExpressPrefill {
  if (raw == null || typeof raw !== "object") return {};
  const p = expressPrefillSchema.safeParse(raw);
  return p.success ? p.data : {};
}

export type ProductCartLine = NonNullable<ExpressPrefill["product_cart"]>[number];

export function productCartToQueryParam(cart: NonNullable<ExpressPrefill["product_cart"]>): string {
  return encodeURIComponent(JSON.stringify(cart));
}

export function parseProductsQueryParam(s: string | undefined | null): ProductCartLine[] {
  if (!s?.trim()) return [];
  try {
    const decoded = decodeURIComponent(s.trim());
    const arr = JSON.parse(decoded) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: ProductCartLine[] = [];
    for (const row of arr) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const product_id = typeof o.product_id === "string" ? o.product_id : null;
      const qty = typeof o.quantity === "number" ? o.quantity : Number(o.quantity);
      if (!product_id || !Number.isFinite(qty) || qty < 1) continue;
      const variant =
        o.product_variant_id === null || o.product_variant_id === undefined
          ? undefined
          : typeof o.product_variant_id === "string"
            ? o.product_variant_id
            : undefined;
      out.push({
        product_id,
        quantity: Math.min(999, Math.floor(qty)),
        ...(variant ? { product_variant_id: variant } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}
