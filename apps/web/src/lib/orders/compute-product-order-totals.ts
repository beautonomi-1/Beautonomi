import type { SupabaseClient } from "@supabase/supabase-js";
import { percentOf, sumLineVat, sumMoney } from "@beautonomi/utils";
import { lineVatRatePercent, resolveProviderVat } from "@/lib/tax/resolve-provider-vat";
import { applyProductOrderPromotion } from "@/lib/ecommerce/product-order-promotion";
import {
  calculatePlatformFeeAmount,
  getEffectivePlatformFeeConfig,
} from "@/lib/platform-service-fee-settings";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { computeProductOrderDeliveryQuote } from "@/lib/orders/product-order-delivery-quote";

export type ProductOrderCartLine = {
  quantity: number;
  product: {
    id: string;
    name: string;
    retail_price: string | number;
    tax_rate?: string | number | null;
    image_urls?: string[] | null;
    weight_grams?: string | number | null;
  };
  product_variant?: {
    id: string;
    retail_price: string | number;
  } | null;
};

export type ProductOrderStockLine = {
  quantity: number;
  product: {
    name?: string | null;
    is_active?: boolean | null;
    retail_sales_enabled?: boolean | null;
    quantity?: number | null;
    track_stock_quantity?: boolean | null;
    has_variants?: boolean | null;
  } | null;
  product_variant?: { quantity?: number | null } | null;
};

/** Availability problems for cart lines (blocking at order creation, warnings in the quote). */
export function collectProductOrderStockIssues(items: ProductOrderStockLine[]): string[] {
  const issues: string[] = [];
  for (const item of items) {
    const p = item.product;
    const variant = item.product_variant;
    const effectiveQty = variant ? (variant.quantity ?? 0) : (p?.quantity ?? 0);
    const tracksStock = p?.track_stock_quantity !== false;
    if (!p || !p.is_active || !p.retail_sales_enabled) {
      issues.push(`${p?.name ?? "Unknown product"} is no longer available`);
    } else if (p.has_variants && !variant) {
      issues.push(`${p.name}: variant required`);
    } else if (tracksStock && effectiveQty < item.quantity) {
      issues.push(`${p.name}: only ${effectiveQty} available (requested ${item.quantity})`);
    }
  }
  return issues;
}

export type ComputeProductOrderTotalsInput = {
  cartItems: ProductOrderCartLine[];
  providerId: string;
  tenantId: string;
  customerId: string;
  fulfillmentType: "collection" | "delivery";
  deliveryAddressId?: string | null;
  collectionLocationId?: string | null;
  promotionCode?: string | null;
  /** When false, platform fee is omitted (in-person tender preview). */
  onlineCheckout?: boolean;
};

export type ProductOrderTotalsResult = {
  subtotal: number;
  promotionDiscount: number;
  discountedSubtotal: number;
  taxAmount: number;
  deliveryFee: number;
  deliveryFeeType: string | null;
  deliveryDistanceKm: number | null;
  promotionId: string | null;
  promotionCode: string | null;
  platformFee: number;
  totalAmount: number;
  items: Array<{
    product_id: string;
    product_variant_id: string | null;
    product_name: string;
    product_image_url: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
};

const DELIVERY_QUOTE_ERROR_MESSAGES: Record<
  "ADDRESS_NOT_FOUND" | "DELIVERY_RADIUS_EXCEEDED" | "DELIVERY_ADDRESS_UNVERIFIED",
  string
> = {
  ADDRESS_NOT_FOUND: "Delivery address not found.",
  DELIVERY_RADIUS_EXCEEDED: "Delivery address is outside this provider's delivery radius.",
  DELIVERY_ADDRESS_UNVERIFIED: "We could not verify this address for delivery. Please confirm it on the map.",
};

export async function computeProductOrderTotals(
  supabase: SupabaseClient,
  input: ComputeProductOrderTotalsInput,
): Promise<{ ok: true; totals: ProductOrderTotalsResult } | { ok: false; code: string; message: string }> {
  if (!input.cartItems.length) {
    return { ok: false, code: "EMPTY_CART", message: "No cart items" };
  }

  let deliveryFee = 0;
  let deliveryFeeType: string | null = null;
  let deliveryDistanceKm: number | null = null;
  if (input.fulfillmentType === "delivery" && input.deliveryAddressId) {
    const quoteResult = await computeProductOrderDeliveryQuote({
      supabase,
      userId: input.customerId,
      providerId: input.providerId,
      deliveryAddressId: input.deliveryAddressId,
      cartItems: input.cartItems,
    });
    if (quoteResult.ok === false) {
      return { ok: false, code: quoteResult.code, message: DELIVERY_QUOTE_ERROR_MESSAGES[quoteResult.code] };
    }
    deliveryFee = quoteResult.quote.fee;
    deliveryFeeType = quoteResult.quote.feeType;
    deliveryDistanceKm = quoteResult.quote.distanceKm;
  }

  let subtotal = 0;
  const items: ProductOrderTotalsResult["items"] = [];
  for (const item of input.cartItems) {
    const p = item.product;
    const variant = item.product_variant;
    const unitPrice = variant ? parseFloat(String(variant.retail_price)) : parseFloat(String(p.retail_price));
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;
    items.push({
      product_id: p.id,
      product_variant_id: variant?.id ?? null,
      product_name: p.name,
      product_image_url: p.image_urls?.[0] ?? null,
      quantity: item.quantity,
      unit_price: unitPrice,
      total_price: lineTotal,
    });
  }

  let promotionDiscount = 0;
  let promotionId: string | null = null;
  let promotionCode: string | null = null;
  if (input.promotionCode) {
    const promo = await applyProductOrderPromotion(supabase, {
      code: input.promotionCode,
      subtotal,
      providerId: input.providerId,
      locationId: input.collectionLocationId ?? null,
      customerId: input.customerId,
    });
    if (promo.ok === false) {
      return { ok: false, code: "PROMO_INVALID", message: promo.message };
    }
    promotionId = promo.promotionId;
    promotionCode = promo.code;
    promotionDiscount = Math.min(promo.discountAmount, subtotal);
  }

  const discountedSubtotal = Math.max(0, Math.round((subtotal - promotionDiscount) * 100) / 100);

  const { data: providerRow } = await supabase
    .from("providers")
    .select(
      "tenant_id, customer_fee_config_id, currency, tax_rate_percent, tax_inclusive, is_vat_registered, vat_number",
    )
    .eq("id", input.providerId)
    .maybeSingle();

  const currency =
    (providerRow as { currency?: string | null } | null)?.currency?.trim() || "ZAR";
  const providerVat = await resolveProviderVat(supabase, providerRow ?? {});

  const discountRatio = subtotal > 0 ? discountedSubtotal / subtotal : 1;
  const vatLines: Array<{ baseAmount: number; ratePercent: number; inclusive: boolean }> = [];
  for (const item of input.cartItems) {
    const p = item.product;
    const variant = item.product_variant;
    const unitPrice = variant ? parseFloat(String(variant.retail_price)) : parseFloat(String(p.retail_price));
    const lineTotal = unitPrice * item.quantity;
    const taxableBase =
      promotionDiscount > 0 && subtotal > 0
        ? Math.round(lineTotal * discountRatio * 100) / 100
        : lineTotal;
    const ratePercent = lineVatRatePercent(providerVat, null);
    if (ratePercent <= 0 || taxableBase <= 0) continue;
    vatLines.push({
      baseAmount: taxableBase,
      ratePercent,
      inclusive: providerVat.inclusive,
    });
  }
  const taxAmount = sumLineVat(vatLines, currency);

  let platformFee = 0;
  if (input.onlineCheckout !== false) {
    const feeConfigId = (providerRow as { customer_fee_config_id?: string | null } | null)
      ?.customer_fee_config_id;
    if (feeConfigId) {
      const feeConfig = await getEffectivePlatformFeeConfig(input.providerId, discountedSubtotal);
      platformFee = calculatePlatformFeeAmount(feeConfig, discountedSubtotal);
    } else {
      const scopedSettings = await fetchScopedSingle<Record<string, unknown>>({
        supabase,
        table: "platform_settings",
        tenantId: input.tenantId,
        select: "settings",
        apply: (q) => q.eq("is_active", true),
        orderBy: { column: "updated_at", ascending: false },
      });
      const settings = (scopedSettings.data as { settings?: Record<string, unknown> } | null)?.settings;
      const payouts = (settings as Record<string, unknown> | undefined)?.payouts as
        | Record<string, unknown>
        | undefined;
      if (payouts) {
        const feeType = (payouts.platform_service_fee_type as string) || "fixed";
        if (feeType === "percentage") {
          platformFee = percentOf(discountedSubtotal, Number(payouts.platform_service_fee_percentage) || 0);
        } else {
          platformFee = Number(payouts.platform_service_fee_fixed) || 0;
        }
      }
    }
  }

  const totalAmount = providerVat.inclusive
    ? sumMoney(discountedSubtotal, deliveryFee, platformFee)
    : sumMoney(discountedSubtotal, taxAmount, deliveryFee, platformFee);

  return {
    ok: true,
    totals: {
      subtotal,
      promotionDiscount,
      discountedSubtotal,
      taxAmount,
      deliveryFee,
      deliveryFeeType,
      deliveryDistanceKm,
      promotionId,
      promotionCode,
      platformFee,
      totalAmount,
      items,
    },
  };
}
