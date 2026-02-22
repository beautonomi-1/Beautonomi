import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

/**
 * GET /api/provider/product-sales — list walk-in sales history
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const limit = Number(request.nextUrl.searchParams.get("limit")) || 50;
    const offset = Number(request.nextUrl.searchParams.get("offset")) || 0;

    const { data: sales, error, count } = await (supabase.from("product_orders") as any)
      .select(
        "id, order_number, total_amount, payment_method, customer_name, customer_phone, created_at, product_order_items(product_name, quantity, unit_price)",
        { count: "exact" },
      )
      .eq("provider_id", providerId)
      .eq("order_source", "walk_in")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const mapped = (sales ?? []).map((s: any) => ({
      ...s,
      items: s.product_order_items ?? [],
      product_order_items: undefined,
    }));

    return successResponse({ sales: mapped, total: count ?? 0 });
  } catch (err) {
    return handleApiError(err, "Failed to fetch walk-in sales");
  }
}

const walkInSaleSchema = z.object({
  items: z.array(
    z.object({
      product_id: z.string().uuid(),
      quantity: z.number().int().min(1),
    }),
  ).min(1),
  payment_method: z.enum(["cash", "yoco"]),
  customer_name: z.string().max(100).optional(),
  customer_phone: z.string().max(20).optional(),
  customer_id: z.string().uuid().optional(),
});

/**
 * POST /api/provider/product-sales — create a walk-in product sale
 * No platform fee, no online payment.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const body = await request.json();
    const parsed = walkInSaleSchema.parse(body);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    // Validate products and stock
    const productIds = parsed.items.map((i) => i.product_id);
    const { data: products, error: prodErr } = await (supabase.from("products") as any)
      .select("id, name, retail_price, quantity, image_urls, tax_rate, provider_id, is_active")
      .in("id", productIds)
      .eq("provider_id", providerId);

    if (prodErr) throw prodErr;

    type ProductRow = { id: string; name: string; quantity: number; retail_price: string; tax_rate?: string; image_urls?: string[]; is_active?: boolean };
    const productMap = new Map<string, ProductRow>((products ?? []).map((p: ProductRow) => [p.id, p]));
    const stockErrors: string[] = [];
    let subtotal = 0;
    let taxAmount = 0;

    const orderItems: Array<{
      product_id: string;
      product_name: string;
      product_image_url: string | null;
      quantity: number;
      unit_price: number;
      total_price: number;
    }> = [];

    for (const item of parsed.items) {
      const prod = productMap.get(item.product_id);
      if (!prod || !prod.is_active) {
        stockErrors.push(`Product not found or inactive: ${item.product_id}`);
        continue;
      }
      if (prod.quantity < item.quantity) {
        stockErrors.push(`${prod.name}: only ${prod.quantity} in stock (requested ${item.quantity})`);
        continue;
      }
      const lineTotal = parseFloat(prod.retail_price) * item.quantity;
      const lineTax = lineTotal * (parseFloat(prod.tax_rate || "0") / 100);
      subtotal += lineTotal;
      taxAmount += lineTax;
      orderItems.push({
        product_id: prod.id,
        product_name: prod.name,
        product_image_url: prod.image_urls?.[0] ?? null,
        quantity: item.quantity,
        unit_price: parseFloat(prod.retail_price),
        total_price: lineTotal,
      });
    }

    if (stockErrors.length > 0) {
      return errorResponse(stockErrors.join("; "), "STOCK_ERROR", 400);
    }

    const totalAmount = subtotal + taxAmount;

    // Generate order number
    const { data: seqData } = await supabase.rpc("nextval", {
      seq_name: "product_order_number_seq",
    }) as any;
    const orderNum = `BO-W${seqData ?? Date.now()}`;

    // Create walk-in order (already paid, no platform fee)
    const { data: order, error: orderErr } = await (supabase.from("product_orders") as any)
      .insert({
        order_number: orderNum,
        customer_id: parsed.customer_id ?? null,
        provider_id: providerId,
        fulfillment_type: "collection",
        subtotal: subtotal.toFixed(2),
        tax_amount: taxAmount.toFixed(2),
        delivery_fee: "0.00",
        platform_fee: "0.00",
        total_amount: totalAmount.toFixed(2),
        payment_method: parsed.payment_method,
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

    // Create order items
    const itemsToInsert = orderItems.map((oi) => ({
      ...oi,
      order_id: order.id,
      unit_price: oi.unit_price.toFixed(2),
      total_price: oi.total_price.toFixed(2),
    }));
    await (supabase.from("product_order_items") as any).insert(itemsToInsert);

    // Decrement stock
    for (const item of parsed.items) {
      await supabase.rpc("decrement_product_stock" as any, {
        p_product_id: item.product_id,
        p_quantity: item.quantity,
      });
    }

    return successResponse({ order: { ...order, items: orderItems } }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create walk-in sale");
  }
}
