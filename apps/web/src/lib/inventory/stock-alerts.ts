/**
 * Inventory Stock Alerts
 * Monitors product stock levels and sends alerts when low
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";
import {
  effectiveStockQuantity,
  type ProductInventoryRow,
} from "@/lib/provider-portal/product-inventory-metrics";

/**
 * Check for low stock products and send alerts
 */
export async function checkLowStockAndAlert(providerId?: string) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    // Build query for products with low stock
    let query = supabaseAdmin
      .from("products")
      .select(`
        id,
        name,
        quantity,
        low_stock_level,
        receive_low_stock_notifications,
        provider_id,
        has_variants,
        track_stock_quantity,
        product_variants(quantity, retail_price),
        providers!inner(
          id,
          user_id,
          business_name
        )
      `)
      .eq("track_stock_quantity", true)
      .eq("receive_low_stock_notifications", true)
      .eq("is_active", true);

    // Filter by provider if specified
    if (providerId) {
      query = query.eq("provider_id", providerId);
    }

    const { data: products, error } = await query;

    if (error) {
      throw error;
    }

    if (!products || products.length === 0) {
      return { checked: 0, alerted: 0 };
    }

    // Filter products that are at or below low stock level (variant-aware, matches catalogue metrics)
    const lowStockProducts = products.filter((product) => {
      const row = product as unknown as ProductInventoryRow;
      const eff = effectiveStockQuantity(row);
      const threshold = Number(product.low_stock_level) || 5;
      return eff > 0 && eff <= threshold;
    });

    if (lowStockProducts.length === 0) {
      return { checked: products.length, alerted: 0 };
    }

    // Group by provider to send one notification per provider
    const productsByProvider = new Map<string, typeof lowStockProducts>();

    for (const product of lowStockProducts) {
      const pid = product.provider_id;
      if (!productsByProvider.has(pid)) {
        productsByProvider.set(pid, []);
      }
      productsByProvider.get(pid)!.push(product);
    }

    // Send notifications (with 7-day cooldown per provider to avoid daily spam)
    const COOLDOWN_DAYS = 7;
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    let alertedCount = 0;
    let skippedCooldown = 0;

    for (const [pid, providerProducts] of productsByProvider.entries()) {
      const provider = providerProducts[0].providers as any;
      if (!provider?.user_id) continue;

      // Check if a low-stock alert was recently sent to this provider
      const { data: recentAlert } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", provider.user_id)
        .eq("type", "system")
        .contains("data", { provider_id: pid })
        .gte("created_at", cooldownCutoff)
        .limit(1);

      if (recentAlert && recentAlert.length > 0) {
        skippedCooldown++;
        continue;
      }

      try {
        const productNames = providerProducts.map((p) => p.name).join(", ");
        const productList = providerProducts
          .map((p) => {
            const eff = effectiveStockQuantity(p as unknown as ProductInventoryRow);
            return `${p.name} (${eff} remaining, threshold: ${p.low_stock_level ?? "—"})`;
          })
          .join("\n");

        const { insertNotification: insertStockNotif } = await import("@/lib/notifications/insert-notification");
        await insertStockNotif({
          user_id: provider.user_id,
          type: "low_stock_alert",
          title: "Low Stock Alert",
          message: `${providerProducts.length} product(s) are running low: ${productNames}`,
          data: {
            provider_id: pid,
            product_count: providerProducts.length,
            products: providerProducts.map((p) => ({
              id: p.id,
              name: p.name,
              quantity: effectiveStockQuantity(p as unknown as ProductInventoryRow),
              low_stock_level: p.low_stock_level,
            })),
          },
          action_url: `/provider/products?low_stock=true`,
        });

        // Send push/email notification
        await sendTemplateNotification(
          "low_stock_alert",
          [provider.user_id],
          {
            product_count: providerProducts.length.toString(),
            product_names: productNames,
            provider_name: provider.business_name || "Your business",
            product_list: productList,
          },
          ["push", "email"],
          // In-app bell row inserted manually above; skip template auto-insert.
          { appType: "provider", skipInApp: true }
        );

        alertedCount++;
      } catch (notifError) {
        console.error(`Error sending low stock alert for provider ${pid}:`, notifError);
      }
    }

    return {
      checked: products.length,
      alerted: alertedCount,
      lowStockCount: lowStockProducts.length,
      skippedCooldown,
    };
  } catch (error) {
    console.error("Error checking low stock:", error);
    throw error;
  }
}

/**
 * Check stock when product is sold (called from booking completion)
 */
export async function checkStockAfterSale(productId: string, quantitySold: number) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data: product, error } = await supabaseAdmin
      .from("products")
      .select("id, quantity, low_stock_level, receive_low_stock_notifications, track_stock_quantity, provider_id, providers!inner(user_id)")
      .eq("id", productId)
      .single();

    if (error || !product) {
      return;
    }

    // Update stock if tracking is enabled
    if (product.track_stock_quantity) {
      const newQuantity = Math.max(0, product.quantity - quantitySold);
      await supabaseAdmin
        .from("products")
        .update({ quantity: newQuantity })
        .eq("id", productId);

      // Check if now low stock
      if (
        product.receive_low_stock_notifications &&
        newQuantity <= (product.low_stock_level || 5)
      ) {
        await checkLowStockAndAlert(product.provider_id);
      }
    }
  } catch (error) {
    console.error("Error checking stock after sale:", error);
  }
}
