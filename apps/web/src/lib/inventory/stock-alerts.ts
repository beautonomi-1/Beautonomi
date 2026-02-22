/**
 * Inventory Stock Alerts
 * Monitors product stock levels and sends alerts when low
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";

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

    // Filter products that are at or below low stock level
    const lowStockProducts = products.filter(
      (product) => product.quantity <= (product.low_stock_level || 5)
    );

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

    // Send notifications
    let alertedCount = 0;
    for (const [pid, providerProducts] of productsByProvider.entries()) {
      const provider = providerProducts[0].providers as any;
      if (!provider?.user_id) continue;

      try {
        const productNames = providerProducts.map((p) => p.name).join(", ");
        const productList = providerProducts
          .map((p) => `${p.name} (${p.quantity} remaining, threshold: ${p.low_stock_level})`)
          .join("\n");

        // Create notification
        await supabaseAdmin.from("notifications").insert({
          user_id: provider.user_id,
          type: "low_stock_alert",
          title: "Low Stock Alert",
          message: `${providerProducts.length} product(s) are running low: ${productNames}`,
          metadata: {
            provider_id: pid,
            product_count: providerProducts.length,
            products: providerProducts.map((p) => ({
              id: p.id,
              name: p.name,
              quantity: p.quantity,
              low_stock_level: p.low_stock_level,
            })),
          },
          link: `/provider/products?low_stock=true`,
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
          ["push", "email"]
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
