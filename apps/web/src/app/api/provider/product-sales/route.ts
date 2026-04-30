import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { z } from "zod";
import { percentOf, sumMoney } from "@beautonomi/utils";
import {
  applyPosProductStockDecrements,
  validatePosProductStock,
} from "@/lib/provider-sales/pos-product-stock";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";

/**
 * GET /api/provider/product-sales — list walk-in sales history
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("view_sales", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const limit = Number(request.nextUrl.searchParams.get("limit")) || 50;
    const offset = Number(request.nextUrl.searchParams.get("offset")) || 0;

    const { data: sales, error, count } = await supabase
      .from("product_orders")
      .select(
        "id, order_number, customer_id, subtotal, tax_amount, total_amount, payment_method, payment_reference, customer_name, customer_phone, created_at, product_order_items(product_name, quantity, unit_price)",
        { count: "exact" },
      )
      .eq("provider_id", providerId)
      .eq("order_source", "walk_in")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    type SaleRow = { product_order_items?: unknown[]; [k: string]: unknown };
    const mapped = (sales ?? []).map((s: SaleRow) => ({
      ...s,
      items: s.product_order_items ?? [],
      product_order_items: undefined,
    }));

    return successResponse({ sales: mapped, total: count ?? 0 });
  } catch (err) {
    return handleApiError(err, "Failed to fetch walk-in sales");
  }
}

const walkInLineSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  product_variant_id: z.string().uuid().optional().nullable(),
});

const walkInSaleSchema = z.object({
  items: z.array(walkInLineSchema).min(1),
  payment_method: z.enum(["cash", "yoco", "card", "eft", "other"]),
  payment_reference: z.string().max(200).optional(),
  customer_name: z.string().max(100).optional(),
  customer_phone: z.string().max(20).optional(),
  customer_id: z.string().uuid().optional(),
});

type WalkInLine = z.infer<typeof walkInLineSchema>;

function mergeWalkInLines(items: WalkInLine[]): WalkInLine[] {
  const map = new Map<string, WalkInLine>();
  for (const row of items) {
    const vid = row.product_variant_id ?? "";
    const key = `${row.product_id}:${vid}`;
    const prev = map.get(key);
    if (prev) {
      map.set(key, { ...prev, quantity: prev.quantity + row.quantity });
    } else {
      map.set(key, { ...row });
    }
  }
  return [...map.values()];
}

function variantLabel(optionValues: Record<string, unknown> | null | undefined, sku: string | null | undefined): string {
  const vals = optionValues && typeof optionValues === "object"
    ? Object.values(optionValues).filter((v) => v != null && String(v).trim() !== "")
    : [];
  if (vals.length) return vals.map(String).join(" / ");
  if (sku?.trim()) return sku.trim();
  return "Option";
}

/**
 * POST /api/provider/product-sales — create a walk-in product sale
 * No platform fee, no online payment.
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("create_sales", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const body = await request.json();
    const parsed = walkInSaleSchema.parse(body);
    const mergedItems = mergeWalkInLines(parsed.items);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: providerRow, error: provTenantErr } = await supabase
      .from("providers")
      .select("tenant_id, tax_rate_percent, is_vat_registered")
      .eq("id", providerId)
      .maybeSingle();
    if (provTenantErr) throw provTenantErr;
    let orderTenantId = (providerRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    if (!orderTenantId) {
      orderTenantId = await resolveTenantIdWithZaFallback(request);
    }
    if (!orderTenantId) {
      return errorResponse(
        "Tenant could not be resolved for this sale. Check provider tenant settings.",
        "TENANT_ERROR",
        500,
      );
    }
    const providerTaxRate = (providerRow as { is_vat_registered?: boolean | null; tax_rate_percent?: number | string | null } | null)
      ?.is_vat_registered
      ? Number((providerRow as { tax_rate_percent?: number | string | null }).tax_rate_percent ?? 0)
      : 0;

    if (parsed.customer_id) {
      const { data: clientRow, error: clientLookupErr } = await supabase
        .from("provider_clients")
        .select("id")
        .eq("provider_id", providerId)
        .eq("customer_id", parsed.customer_id)
        .maybeSingle();
      if (clientLookupErr) throw clientLookupErr;
      if (!clientRow) {
        return errorResponse(
          "Selected client is not in your saved client list.",
          "VALIDATION_ERROR",
          400,
        );
      }
    }

    const posItems = mergedItems.map((i) => ({
      type: "product" as const,
      item_id: i.product_id,
      product_variant_id: i.product_variant_id ?? null,
      quantity: i.quantity,
    }));

    const stockValidation = await validatePosProductStock(supabase, providerId, posItems);
    if (stockValidation) {
      return errorResponse(stockValidation, "STOCK_ERROR", 400);
    }

    const productIds = [...new Set(mergedItems.map((i) => i.product_id))];
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, name, retail_price, quantity, image_urls, tax_rate, provider_id, is_active, retail_sales_enabled, has_variants")
      .in("id", productIds)
      .eq("provider_id", providerId);

    if (prodErr) throw prodErr;

    type ProductRow = {
      id: string;
      name: string;
      quantity: number;
      retail_price: string;
      tax_rate?: string | null;
      image_urls?: string[] | null;
      is_active?: boolean | null;
      retail_sales_enabled?: boolean | null;
      has_variants?: boolean | null;
    };
    const productMap = new Map<string, ProductRow>((products ?? []).map((p: ProductRow) => [p.id, p]));

    const variantIds = mergedItems.map((i) => i.product_variant_id).filter((v): v is string => Boolean(v));
    let variantMap = new Map<
      string,
      { id: string; product_id: string; quantity: number; retail_price: string; option_values?: Record<string, unknown> | null; sku?: string | null }
    >();
    if (variantIds.length > 0) {
      const { data: vars, error: vErr } = await supabase
        .from("product_variants")
        .select("id, product_id, quantity, retail_price, option_values, sku")
        .in("id", variantIds);
      if (vErr) throw vErr;
      variantMap = new Map(
        (vars ?? []).map((v: { id: string; product_id: string; quantity: number; retail_price: string; option_values?: unknown; sku?: string | null }) => [
          v.id,
          {
            ...v,
            option_values: (v.option_values && typeof v.option_values === "object" ? v.option_values as Record<string, unknown> : null) ?? null,
          },
        ]),
      );
    }

    const stockErrors: string[] = [];
    let subtotal = 0;
    let taxAmount = 0;

    const orderItems: Array<{
      product_id: string;
      product_variant_id: string | null;
      product_name: string;
      product_image_url: string | null;
      quantity: number;
      unit_price: number;
      total_price: number;
    }> = [];

    for (const item of mergedItems) {
      const prod = productMap.get(item.product_id);
      if (!prod || prod.is_active === false) {
        stockErrors.push(`Product not found or inactive: ${item.product_id}`);
        continue;
      }
      if (prod.retail_sales_enabled === false) {
        stockErrors.push(`${prod.name} is internal-only and cannot be sold on a walk-in retail sale.`);
        continue;
      }

      const vid = item.product_variant_id ?? null;
      let unitPrice: number;
      let displayName: string;
      const imageUrl: string | null = prod.image_urls?.[0] ?? null;

      if (vid) {
        const pv = variantMap.get(vid);
        if (!pv || pv.product_id !== prod.id) {
          stockErrors.push(`Invalid variant for ${prod.name}.`);
          continue;
        }
        unitPrice = parseFloat(pv.retail_price);
        displayName = `${prod.name} — ${variantLabel(pv.option_values, pv.sku ?? null)}`;
      } else {
        unitPrice = parseFloat(prod.retail_price);
        displayName = prod.name;
      }

      const lineTotal = unitPrice * item.quantity;
      const lineTax = percentOf(lineTotal, Number.isFinite(providerTaxRate) ? providerTaxRate : 0);
      subtotal += lineTotal;
      taxAmount += lineTax;
      orderItems.push({
        product_id: prod.id,
        product_variant_id: vid,
        product_name: displayName,
        product_image_url: imageUrl,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: lineTotal,
      });
    }

    if (stockErrors.length > 0) {
      return errorResponse(stockErrors.join("; "), "STOCK_ERROR", 400);
    }

    const paymentMethodForOrder = parsed.payment_method === "eft" ? "other" : parsed.payment_method;
    const paymentProviderForLedger =
      parsed.payment_method === "yoco"
        ? "yoco"
        : parsed.payment_method === "cash"
          ? "cash"
          : "card_on_delivery";

    if (parsed.payment_method === "yoco" && !parsed.payment_reference?.trim()) {
      return errorResponse(
        "Yoco walk-in product sales require the terminal payment reference.",
        "YOCO_REFERENCE_REQUIRED",
        400,
      );
    }

    const totalAmount = sumMoney(subtotal, taxAmount);

    const { data: seqData } = await supabase.rpc("nextval", {
      seq_name: "product_order_number_seq",
    });
    const orderNum = `BO-W${seqData ?? Date.now()}`;

    const { data: order, error: orderErr } = await supabase
      .from("product_orders")
      .insert({
        tenant_id: orderTenantId,
        order_number: orderNum,
        customer_id: parsed.customer_id ?? null,
        provider_id: providerId,
        fulfillment_type: "collection",
        subtotal: subtotal.toFixed(2),
        tax_amount: taxAmount.toFixed(2),
        delivery_fee: "0.00",
        platform_fee: "0.00",
        total_amount: totalAmount.toFixed(2),
        payment_method: paymentMethodForOrder,
        payment_reference: parsed.payment_reference ?? null,
        payment_status: "paid",
        status: "delivered",
        order_source: "walk_in",
        staff_id: user.id,
        customer_name: parsed.customer_name ?? null,
        customer_phone: parsed.customer_phone ?? null,
        confirmed_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
        paid_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    const itemsToInsert = orderItems.map((oi) => ({
      order_id: order.id,
      product_id: oi.product_id,
      product_variant_id: oi.product_variant_id,
      product_name: oi.product_name,
      product_image_url: oi.product_image_url,
      quantity: oi.quantity,
      unit_price: oi.unit_price.toFixed(2),
      total_price: oi.total_price.toFixed(2),
    }));

    const { error: insertErr } = await supabase.from("product_order_items").insert(itemsToInsert);
    if (insertErr) throw insertErr;

    await recordProductOrderPayment({
      supabase: supabase as never,
      productOrderId: order.id,
      reference: parsed.payment_reference?.trim() || `walk_in_pos_${order.id}`,
      amountMajor: totalAmount,
      feesMajor: 0,
      source: "walk_in_pos",
      provider: paymentProviderForLedger,
      platformHeld: false,
    });

    await applyPosProductStockDecrements(supabase, posItems);

    return successResponse({ order: { ...order, items: orderItems } }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create walk-in sale");
  }
}
