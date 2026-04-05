import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { fetchScopedSingle } from "@/lib/tenant/scoped-overrides";
import { z } from "zod";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";
import { notifyProviderTeamUsers } from "@/lib/notifications/notify-provider-team";
import { getPaymentFeatureFlagsForTenant } from "@/lib/subscriptions/entitlements";
import { getPlatformPaymentTypesForTenant } from "@/lib/payments/platform-payment-types";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";
import { cancelStalePendingPaystackProductOrders } from "@/lib/orders/product-order-lifecycle";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { percentOf, sumMoney, roundCurrency } from "@beautonomi/utils";

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
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");
    const offset = (page - 1) * limit;
    const { data: tenantProviders } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId);
    const tenantProviderIds = (tenantProviders ?? []).map((p) => p.id);
    if (tenantProviderIds.length === 0) {
      return successResponse({
        orders: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      });
    }

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
      .in("provider_id", tenantProviderIds)
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
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);

    if (parsed.fulfillment_type === "delivery" && !parsed.delivery_address_id) {
      return errorResponse("Delivery address is required for delivery orders", "VALIDATION", 400);
    }
    if (parsed.fulfillment_type === "collection" && !parsed.collection_location_id) {
      return errorResponse("Collection location is required", "VALIDATION", 400);
    }

    const { data: providerForTenant } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", parsed.provider_id)
      .maybeSingle();
    const orderTenantId =
      (providerForTenant as { tenant_id?: string | null } | null)?.tenant_id ?? null;
    if (!orderTenantId || orderTenantId !== tenantId) {
      return errorResponse("Provider not available in this market", "TENANT_MISMATCH", 404);
    }

    const paymentMethod = parsed.payment_method ?? "paystack";
    const paymentFlags = await getPaymentFeatureFlagsForTenant(orderTenantId);
    const paymentTypes = await getPlatformPaymentTypesForTenant(supabase as any, orderTenantId);
    if (paymentMethod === "paystack") {
      if (!paymentFlags.payment_paystack) {
        return errorResponse(
          "Online card payment is currently unavailable. Please choose pay on delivery or another method.",
          "FEATURE_DISABLED",
          400
        );
      }
    }
    if ((paymentMethod === "cash" || paymentMethod === "card_on_delivery") && !paymentTypes.cash) {
      return errorResponse(
        "Pay-on-delivery is currently unavailable. Please pay online.",
        "FEATURE_DISABLED",
        400,
      );
    }
    if (parsed.use_wallet === true) {
      if (!paymentFlags.payment_wallet) {
        return errorResponse(
          "Wallet payment is currently unavailable.",
          "FEATURE_DISABLED",
          400
        );
      }
    }

    // Get cart items for this provider (include product_variant when present)
    const { data: cartItems, error: cartErr } = await (supabase.from("cart_items") as any)
      .select(
        `
        id, quantity, product_variant_id,
        product:products (
          id, name, retail_price, quantity, is_active, retail_sales_enabled,
          image_urls, tax_rate, provider_id, has_variants
        ),
        product_variant:product_variants (
          id, retail_price, quantity
        )
      `,
      )
      .eq("user_id", user.id)
      .eq("provider_id", parsed.provider_id);

    if (cartErr) throw cartErr;
    if (!cartItems || cartItems.length === 0) {
      return errorResponse("No cart items found for this provider", "EMPTY_CART", 400);
    }

    // Validate stock for all items (use variant quantity when variant)
    const stockErrors: string[] = [];
    for (const item of cartItems) {
      const p = item.product;
      const variant = item.product_variant;
      const effectiveQty = variant ? (variant.quantity ?? 0) : (p?.quantity ?? 0);
      if (!p || !p.is_active || !p.retail_sales_enabled) {
        stockErrors.push(`${p?.name ?? "Unknown product"} is no longer available`);
      } else if (p.has_variants && !variant) {
        stockErrors.push(`${p.name}: variant required`);
      } else if (effectiveQty < item.quantity) {
        stockErrors.push(`${p.name}: only ${effectiveQty} available (requested ${item.quantity})`);
      }
    }
    if (stockErrors.length > 0) {
      return errorResponse(stockErrors.join("; "), "INSUFFICIENT_STOCK", 400);
    }

    const adminSupabase = getSupabaseAdmin();
    await cancelStalePendingPaystackProductOrders(adminSupabase, user.id, parsed.provider_id);

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
          (sum: number, ci: any) => {
            const price = ci.product_variant ? ci.product_variant.retail_price : ci.product.retail_price;
            return sum + (parseFloat(price) || 0) * ci.quantity;
          },
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
      product_variant_id: string | null;
      product_name: string;
      product_image_url: string | null;
      quantity: number;
      unit_price: number;
      total_price: number;
    }> = [];

    for (const item of cartItems) {
      const p = item.product;
      const variant = item.product_variant;
      const unitPrice = variant ? parseFloat(variant.retail_price) : parseFloat(p.retail_price);
      const lineTotal = unitPrice * item.quantity;
      const lineTax = percentOf(lineTotal, parseFloat(p.tax_rate || "0"));
      subtotal += lineTotal;
      taxAmount += lineTax;
      orderItems.push({
        product_id: p.id,
        product_variant_id: variant?.id ?? null,
        product_name: p.name,
        product_image_url: p.image_urls?.[0] ?? null,
        quantity: item.quantity,
        unit_price: unitPrice,
        total_price: lineTotal,
      });
    }

    // Calculate platform fee for online orders
    let platformFee = 0;
    const isOnline = !["cash", "yoco", "card_on_delivery"].includes(parsed.payment_method ?? "paystack");
    if (isOnline) {
      const scopedSettings = await fetchScopedSingle<Record<string, unknown>>({
        supabase,
        table: "platform_settings",
        tenantId,
        select: "settings",
        apply: (q) => q.eq("is_active", true),
        orderBy: { column: "updated_at", ascending: false },
      });
      const settings = (scopedSettings.data as { settings?: Record<string, unknown> } | null)?.settings;
      const payouts = (settings as Record<string, any> | undefined)?.payouts as Record<string, any> | undefined;
      if (payouts) {
        const feeType = (payouts.platform_service_fee_type as string) || "percentage";
        if (feeType === "fixed") {
          platformFee = Number(payouts.platform_service_fee_fixed) || 0;
        } else {
          const pct = Number(payouts.platform_service_fee_percentage) || 5;
          platformFee = percentOf(subtotal, pct);
        }
      } else {
        platformFee = percentOf(subtotal, 5);
      }
    }

    const totalAmount = sumMoney(subtotal, taxAmount, deliveryFee, platformFee);

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
    const deferCartClearForPaystack =
      paymentMethod === "paystack" && !paidWithWalletOnly && amountAfterWallet > 0;

    // Generate order number
    const { data: seqData } = await supabase.rpc("nextval", {
      seq_name: "product_order_number_seq",
    }) as any;
    const orderNum = `BO-${seqData ?? Date.now()}`;

    // Create order (wallet_amount and payment_status when paid by wallet)
    const { data: order, error: orderErr } = await (supabase.from("product_orders") as any)
      .insert({
        tenant_id: orderTenantId,
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
        p_tenant_id: orderTenantId,
      });
    }

    if (paidWithWalletOnly) {
      await recordProductOrderPayment({
        supabase: supabase as any,
        productOrderId: order.id,
        reference: `wallet_product_order_${order.id}`,
        amountMajor: totalAmount,
        feesMajor: 0,
        source: "wallet_checkout",
        provider: "wallet",
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

    // Decrement stock for each product (variant or product-level)
    for (const item of cartItems) {
      if (item.product_variant_id) {
        await (supabase.rpc as any)("decrement_product_variant_stock", {
          p_variant_id: item.product_variant_id,
          p_quantity: item.quantity,
        });
      } else {
        await supabase.rpc("decrement_product_stock" as any, {
          p_product_id: item.product.id,
          p_quantity: item.quantity,
        });
      }
    }

    // Clear cart when checkout is complete or does not depend on Paystack success
    if (!deferCartClearForPaystack) {
      await (supabase.from("cart_items") as any)
        .delete()
        .eq("user_id", user.id)
        .eq("provider_id", parsed.provider_id);
    }

    // Notify provider team (owner + active staff with linked accounts)
    const { format: formatOrderTotal } = await getTenantMoneyFormatter(orderTenantId);
    await notifyProviderTeamUsers(parsed.provider_id, {
      type: "product_order_placed",
      title: "New Product Order",
      message: `New order ${orderNum} received — ${formatOrderTotal(totalAmount)} (${orderItems.length} items)`,
      metadata: {
        product_order_id: order.id,
        order_number: orderNum,
        total_amount: totalAmount,
      },
      link: "/provider/ecommerce/orders",
    });

    // Order confirmation to customer via OneSignal notification template (push + email)
    try {
      const { notifyOrderConfirmation } = await import("@/lib/notifications/notification-service");
      await notifyOrderConfirmation(
        user.id,
        order.id,
        order.order_number,
        totalAmount,
        ["push", "email"],
      );
    } catch (notifyErr) {
      console.warn("Order confirmation notification failed:", notifyErr);
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
