import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";

const createOrderSchema = z.object({
  provider_id: z.string().uuid(),
  fulfillment_type: z.enum(["collection", "delivery"]),
  delivery_address_id: z.string().uuid().optional(),
  delivery_instructions: z.string().max(500).optional(),
  collection_location_id: z.string().uuid().optional(),
  payment_method: z.enum(["paystack", "cash", "yoco", "card_on_delivery", "wallet"]).optional(),
  use_wallet: z.boolean().optional(),
});

/**
 * GET /api/me/orders
 * List customer's product orders
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabase = await getSupabaseServer();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");
    const offset = (page - 1) * limit;

    let query = (supabase.from("product_orders") as any)
      .select(
        `
        *,
        items:product_order_items (
          id, product_name, product_image_url, quantity, unit_price, total_price
        ),
        provider:providers (
          id, business_name, slug
        )
      `,
        { count: "exact" },
      )
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: orders, error, count } = await query;
    if (error) throw error;

    return successResponse({
      orders: orders ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch orders");
  }
}

/**
 * POST /api/me/orders
 * Create a new product order from cart items for a specific provider.
 * Validates stock, decrements inventory, calculates totals.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const body = await request.json();
    const parsed = createOrderSchema.parse(body);
    const supabase = await getSupabaseServer();

    if (parsed.fulfillment_type === "delivery" && !parsed.delivery_address_id) {
      return errorResponse("Delivery address is required for delivery orders", "VALIDATION", 400);
    }
    if (parsed.fulfillment_type === "collection" && !parsed.collection_location_id) {
      return errorResponse("Collection location is required", "VALIDATION", 400);
    }

    // Get cart items for this provider
    const { data: cartItems, error: cartErr } = await (supabase.from("cart_items") as any)
      .select(
        `
        id, quantity,
        product:products (
          id, name, retail_price, quantity, is_active, retail_sales_enabled,
          image_urls, tax_rate, provider_id
        )
      `,
      )
      .eq("user_id", user.id)
      .eq("provider_id", parsed.provider_id);

    if (cartErr) throw cartErr;
    if (!cartItems || cartItems.length === 0) {
      return errorResponse("No cart items found for this provider", "EMPTY_CART", 400);
    }

    // Validate stock for all items
    const stockErrors: string[] = [];
    for (const item of cartItems) {
      const p = item.product;
      if (!p || !p.is_active || !p.retail_sales_enabled) {
        stockErrors.push(`${p?.name ?? "Unknown product"} is no longer available`);
      } else if (p.quantity < item.quantity) {
        stockErrors.push(`${p.name}: only ${p.quantity} available (requested ${item.quantity})`);
      }
    }
    if (stockErrors.length > 0) {
      return errorResponse(stockErrors.join("; "), "INSUFFICIENT_STOCK", 400);
    }

    // Get shipping config for delivery fee
    let deliveryFee = 0;
    if (parsed.fulfillment_type === "delivery") {
      const { data: shipConfig } = await (supabase.from("provider_shipping_config") as any)
        .select("delivery_fee, free_delivery_threshold")
        .eq("provider_id", parsed.provider_id)
        .maybeSingle();

      if (shipConfig) {
        deliveryFee = parseFloat(shipConfig.delivery_fee) || 0;
        const subtotalCalc = cartItems.reduce(
          (sum: number, ci: any) => sum + ci.product.retail_price * ci.quantity,
          0,
        );
        if (
          shipConfig.free_delivery_threshold &&
          subtotalCalc >= parseFloat(shipConfig.free_delivery_threshold)
        ) {
          deliveryFee = 0;
        }
      }
    }

    // Calculate totals
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

    for (const item of cartItems) {
      const p = item.product;
      const lineTotal = parseFloat(p.retail_price) * item.quantity;
      const lineTax = lineTotal * (parseFloat(p.tax_rate || "0") / 100);
      subtotal += lineTotal;
      taxAmount += lineTax;
      orderItems.push({
        product_id: p.id,
        product_name: p.name,
        product_image_url: p.image_urls?.[0] ?? null,
        quantity: item.quantity,
        unit_price: parseFloat(p.retail_price),
        total_price: lineTotal,
      });
    }

    // Calculate platform fee for online orders
    let platformFee = 0;
    const isOnline = !["cash", "yoco"].includes(parsed.payment_method ?? "paystack");
    if (isOnline) {
      const { data: platformSettings } = await (supabase.from("platform_settings") as any)
        .select("platform_service_fee_type, platform_service_fee_percentage, platform_service_fee_fixed")
        .single();

      if (platformSettings) {
        if (platformSettings.platform_service_fee_type === "fixed") {
          platformFee = parseFloat(platformSettings.platform_service_fee_fixed) || 0;
        } else {
          const pct = parseFloat(platformSettings.platform_service_fee_percentage) || 5;
          platformFee = Math.round(subtotal * pct) / 100;
        }
      } else {
        platformFee = Math.round(subtotal * 5) / 100;
      }
    }

    const totalAmount = subtotal + taxAmount + deliveryFee + platformFee;

    // Determine wallet amount to apply (debit happens after order is created so we have order id)
    let walletAmountApplied = 0;
    const useWallet = parsed.use_wallet === true;
    if (useWallet && totalAmount > 0) {
      const { data: walletRow } = await (supabase.from("user_wallets") as any)
        .select("id, balance, currency")
        .eq("user_id", user.id)
        .maybeSingle();
      const balance = Number((walletRow as any)?.balance ?? 0);
      if (balance > 0) walletAmountApplied = Math.min(balance, totalAmount);
    }
    const amountAfterWallet = Math.max(0, totalAmount - walletAmountApplied);
    const paidWithWalletOnly = amountAfterWallet <= 0 && walletAmountApplied > 0;

    // Generate order number
    const { data: seqData } = await supabase.rpc("nextval", {
      seq_name: "product_order_number_seq",
    }) as any;
    const orderNum = `BO-${seqData ?? Date.now()}`;

    // Create order (wallet_amount and payment_status when paid by wallet)
    const { data: order, error: orderErr } = await (supabase.from("product_orders") as any)
      .insert({
        order_number: orderNum,
        customer_id: user.id,
        provider_id: parsed.provider_id,
        fulfillment_type: parsed.fulfillment_type,
        delivery_address_id: parsed.delivery_address_id ?? null,
        delivery_instructions: parsed.delivery_instructions ?? null,
        collection_location_id: parsed.collection_location_id ?? null,
        subtotal: subtotal.toFixed(2),
        tax_amount: taxAmount.toFixed(2),
        delivery_fee: deliveryFee.toFixed(2),
        platform_fee: platformFee.toFixed(2),
        total_amount: totalAmount.toFixed(2),
        wallet_amount: walletAmountApplied.toFixed(2),
        payment_method: paidWithWalletOnly ? "wallet" : (parsed.payment_method ?? "paystack"),
        payment_status: paidWithWalletOnly ? "paid" : "pending",
        order_source: "online",
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // Debit wallet after order exists (so we can attach order id to transaction)
    if (walletAmountApplied > 0) {
      await (supabase.rpc as any)("wallet_debit_self", {
        p_amount: walletAmountApplied,
        p_description: `Product order ${order.order_number}`,
        p_reference_id: order.id,
        p_reference_type: "product_order",
      });
    }

    // Create order items
    const itemsToInsert = orderItems.map((oi) => ({
      ...oi,
      order_id: order.id,
      unit_price: oi.unit_price.toFixed(2),
      total_price: oi.total_price.toFixed(2),
    }));

    const { error: itemsErr } = await (supabase.from("product_order_items") as any).insert(
      itemsToInsert,
    );
    if (itemsErr) throw itemsErr;

    // Decrement stock for each product
    for (const item of cartItems) {
      await supabase.rpc("decrement_product_stock" as any, {
        p_product_id: item.product.id,
        p_quantity: item.quantity,
      });
    }

    // Clear cart items for this provider
    await (supabase.from("cart_items") as any)
      .delete()
      .eq("user_id", user.id)
      .eq("provider_id", parsed.provider_id);

    // Notify provider of new order
    const { data: provider } = await (supabase.from("providers") as any)
      .select("owner_id")
      .eq("id", parsed.provider_id)
      .single();

    if (provider?.owner_id) {
      await supabase.from("notifications").insert({
        user_id: provider.owner_id,
        type: "product_order_placed",
        title: "New Product Order",
        message: `New order ${orderNum} received — R${totalAmount.toFixed(2)} (${orderItems.length} items)`,
        metadata: {
          product_order_id: order.id,
          order_number: orderNum,
          total_amount: totalAmount,
        },
        link: "/provider/ecommerce/orders",
      }).then(() => {}, () => {});
    }

    return successResponse({
      order: { ...order, items: orderItems },
      paid_with_wallet: paidWithWalletOnly,
      amount_due: amountAfterWallet,
    }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create order");
  }
}
