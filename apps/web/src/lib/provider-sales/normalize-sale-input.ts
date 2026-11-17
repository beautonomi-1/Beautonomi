import { addMoney, LAST_RESORT_CURRENCY, multiplyMoney, roundCurrency } from "@beautonomi/utils";

/**
 * Server-side normalisation of POST /api/provider/sales input (F3-06).
 *
 * - `unit_price` is resolved from the catalogue (`products` / `product_variants`
 *   / `offerings`) whenever the line carries an `item_id`; the client value is
 *   only used for ad-hoc lines with no id.
 * - `subtotal` is always Σ(unit_price × quantity).
 * - `discount_amount` is clamped to [0, subtotal]; `tip_amount` to ≥ 0.
 * - `payment_status` is derived server-side: a client may only ask for the
 *   deferred `pending` state; every other value falls back to `completed`.
 */

export type RawSaleItem = {
  type?: string;
  item_id?: string | null;
  product_variant_id?: string | null;
  name?: string;
  quantity?: unknown;
  unit_price?: unknown;
  [key: string]: unknown;
};

export type NormalizedSaleItem = RawSaleItem & {
  quantity: number;
  unit_price: number;
  total_price: number;
};

export type NormalizeSaleItemsResult =
  | { ok: true; items: NormalizedSaleItem[]; subtotal: number }
  | { ok: false; message: string; code: string };

function round2(n: number): number {
  return roundCurrency(n);
}

export async function normalizeSaleItemsServerSide(
  supabase: any,
  providerId: string,
  items: RawSaleItem[],
  opts: { resolveCatalogPrices: boolean },
): Promise<NormalizeSaleItemsResult> {
  const out: NormalizedSaleItem[] = [];
  let subtotal = 0;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx] ?? {};
    const qtyRaw = Number(item.quantity ?? 1);
    if (!Number.isFinite(qtyRaw) || qtyRaw <= 0) {
      return { ok: false, message: `Item ${idx + 1}: quantity must be a positive number`, code: "VALIDATION_ERROR" };
    }
    const quantity = Math.max(1, Math.floor(qtyRaw));

    const clientPrice = Number(item.unit_price ?? 0);
    if (!Number.isFinite(clientPrice) || clientPrice < 0) {
      return { ok: false, message: `Item ${idx + 1}: unit_price must be a non-negative number`, code: "VALIDATION_ERROR" };
    }

    let unitPrice = clientPrice;
    const lineType = item.type || "product";
    const itemId = typeof item.item_id === "string" && item.item_id.trim() ? item.item_id.trim() : null;

    if (opts.resolveCatalogPrices && itemId) {
      if (lineType === "product") {
        const variantId =
          typeof item.product_variant_id === "string" && item.product_variant_id.trim()
            ? item.product_variant_id.trim()
            : null;
        const { data: prod, error } = await supabase
          .from("products")
          .select("id, retail_price, provider_id")
          .eq("id", itemId)
          .eq("provider_id", providerId)
          .maybeSingle();
        if (error) {
          return { ok: false, message: error.message, code: "PRICE_RESOLUTION_FAILED" };
        }
        if (!prod) {
          return { ok: false, message: `Product not found: ${itemId}`, code: "VALIDATION_ERROR" };
        }
        let resolved = Number((prod as { retail_price?: unknown }).retail_price);
        if (variantId) {
          const { data: pv, error: ve } = await supabase
            .from("product_variants")
            .select("id, retail_price, product_id")
            .eq("id", variantId)
            .eq("product_id", itemId)
            .maybeSingle();
          if (ve) {
            return { ok: false, message: ve.message, code: "PRICE_RESOLUTION_FAILED" };
          }
          if (!pv) {
            return { ok: false, message: `Invalid variant for product ${itemId}`, code: "VALIDATION_ERROR" };
          }
          const vp = Number((pv as { retail_price?: unknown }).retail_price);
          if (Number.isFinite(vp)) resolved = vp;
        }
        if (Number.isFinite(resolved)) unitPrice = Math.max(0, resolved);
      } else if (lineType === "service") {
        const { data: svc, error } = await supabase
          .from("offerings")
          .select("id, price, provider_id")
          .eq("id", itemId)
          .eq("provider_id", providerId)
          .maybeSingle();
        if (error) {
          return { ok: false, message: error.message, code: "PRICE_RESOLUTION_FAILED" };
        }
        if (!svc) {
          return { ok: false, message: `Service not found: ${itemId}`, code: "VALIDATION_ERROR" };
        }
        const sp = Number((svc as { price?: unknown }).price);
        if (Number.isFinite(sp)) unitPrice = Math.max(0, sp);
      }
      if (Math.abs(unitPrice - clientPrice) > 0.009) {
        console.warn(
          `[provider/sales] item ${idx} client unit_price ${clientPrice} differs from catalogue price ${unitPrice}; using catalogue price`,
        );
      }
    }

    unitPrice = round2(unitPrice);
    const total = multiplyMoney(unitPrice, quantity, LAST_RESORT_CURRENCY);
    subtotal = addMoney(subtotal, total, LAST_RESORT_CURRENCY);
    out.push({ ...item, quantity, unit_price: unitPrice, total_price: total });
  }

  return { ok: true, items: out, subtotal: round2(subtotal) };
}

/** Clamp a client discount to [0, subtotal]. */
export function clampSaleDiscount(raw: unknown, subtotal: number): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return round2(Math.min(n, Math.max(0, subtotal)));
}

/** Tips are never negative. */
export function clampSaleTip(raw: unknown): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return round2(n);
}

/**
 * Derive the sale payment status. The client may only request the deferred
 * `pending` state (terminal / card-machine / gateway collection). Anything else
 * — including `refunded`, `failed`, or an arbitrary string — resolves to
 * `completed`. Split-payment legs are recorded as completed, so a sale with
 * legs is always `completed`.
 */
export function deriveSalePaymentStatus(
  clientStatus: unknown,
  opts: { hasPaymentLegs: boolean },
): "completed" | "pending" {
  if (opts.hasPaymentLegs) return "completed";
  return String(clientStatus ?? "").toLowerCase() === "pending" ? "pending" : "completed";
}
