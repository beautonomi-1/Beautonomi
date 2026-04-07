import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * After a product order is paid, grant `customer_package_entitlements` rows for line items whose
 * `product_id` appears in `service_package_items` as a package-linked product (catalog package product).
 */
export async function ensurePackageEntitlementsFromProductOrder(
  admin: SupabaseClient,
  productOrderId: string
): Promise<void> {
  const { data: order, error: orderErr } = await (admin.from("product_orders") as any)
    .select("id, customer_id, provider_id, payment_status")
    .eq("id", productOrderId)
    .maybeSingle();

  if (orderErr || !order || order.payment_status !== "paid") {
    return;
  }

  const customerId = order.customer_id as string;
  const providerId = order.provider_id as string;

  const { data: items, error: itemsErr } = await (admin.from("product_order_items") as any)
    .select("id, product_id, quantity, product_name")
    .eq("order_id", productOrderId);

  if (itemsErr || !items?.length) {
    return;
  }

  for (const line of items as Array<{ product_id: string; quantity: number }>) {
    const qty = Math.max(1, Number(line.quantity) || 1);
    const { data: spiRows } = await admin
      .from("service_package_items")
      .select("package_id")
      .eq("product_id", line.product_id)
      .limit(5);

    if (!spiRows?.length) continue;

    const packageIds = [...new Set(spiRows.map((r: { package_id: string }) => r.package_id))];

    for (const packageId of packageIds) {
      const { data: pkg } = await admin
        .from("service_packages")
        .select("id, provider_id, is_active")
        .eq("id", packageId)
        .maybeSingle();

      if (!pkg || (pkg as { provider_id?: string }).provider_id !== providerId) continue;
      if ((pkg as { is_active?: boolean }).is_active === false) continue;

      const { data: offeringLines } = await admin
        .from("service_package_items")
        .select("quantity, offering_id")
        .eq("package_id", packageId)
        .not("offering_id", "is", null);

      const sessionsPerPackage = (offeringLines || []).reduce((sum: number, row: { quantity?: number | null }) => {
        return sum + Math.max(1, Number(row.quantity) || 1);
      }, 0);
      const grantSessions = Math.max(1, sessionsPerPackage) * qty;

      const { data: existing } = await admin
        .from("customer_package_entitlements")
        .select("id, sessions_remaining")
        .eq("customer_id", customerId)
        .eq("provider_id", providerId)
        .eq("package_id", packageId)
        .maybeSingle();

      if (existing) {
        const cur = Number((existing as { sessions_remaining?: number }).sessions_remaining ?? 0);
        await (admin.from("customer_package_entitlements") as any)
          .update({
            sessions_remaining: cur + grantSessions,
            updated_at: new Date().toISOString(),
            metadata: {
              last_order_top_up: productOrderId,
              product_line_product_id: line.product_id,
            },
          })
          .eq("id", (existing as { id: string }).id);
      } else {
        await (admin.from("customer_package_entitlements") as any).insert({
          customer_id: customerId,
          provider_id: providerId,
          package_id: packageId,
          sessions_remaining: grantSessions,
          metadata: {
            source: "product_order",
            product_order_id: productOrderId,
            product_id: line.product_id,
          },
        });
      }
    }
  }
}
