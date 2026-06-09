import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";
import { resolveTenantIdForFinanceLedger } from "@/lib/finance/resolve-tenant-id-for-ledger";
import { getProviderTeamUserIds, notifyProviderTeamUsers } from "@/lib/notifications/notify-provider-team";
import { insertNotification } from "@/lib/notifications/insert-notification";
import { notifyOrderConfirmation } from "@/lib/notifications/notification-service";
import { sendTemplateNotification } from "@/lib/notifications/onesignal";
import { syncPushBadgeCount } from "@/lib/notifications/sync-push-badge-count";

function formatPaidOrderMessage(
  formatMoney: (value: number) => string,
  orderNumber: string,
  totalAmount: number,
  walletAmount: number,
  itemCount?: number,
): string {
  const itemsSuffix =
    typeof itemCount === "number" && itemCount > 0 ? ` (${itemCount} item${itemCount === 1 ? "" : "s"})` : "";
  const total = formatMoney(totalAmount);
  if (walletAmount > 0.009) {
    const cardPaid = Math.max(0, totalAmount - walletAmount);
    if (cardPaid > 0.009) {
      return `New order ${orderNumber} received${itemsSuffix} — ${total} (${formatMoney(walletAmount)} wallet, ${formatMoney(cardPaid)} card)`;
    }
    return `New order ${orderNumber} received${itemsSuffix} — ${total} (paid with wallet)`;
  }
  return `New order ${orderNumber} received${itemsSuffix} — ${total}`;
}

async function resolveProductOrderCustomerLabel(
  supabase: SupabaseClient,
  order: {
    order_source?: string | null;
    customer_name?: string | null;
    customer_id?: string | null;
  },
): Promise<string> {
  const isWalkIn = String(order.order_source ?? "") === "walk_in";
  if (isWalkIn) {
    return String(order.customer_name || "").trim() || "Walk-in customer";
  }
  const fromOrder = String(order.customer_name || "").trim();
  if (fromOrder) return fromOrder;
  const customerId = order.customer_id;
  if (customerId) {
    const { data: userRow } = await (supabase.from("users") as any)
      .select("full_name")
      .eq("id", customerId)
      .maybeSingle();
    const fullName = String((userRow as { full_name?: string } | null)?.full_name ?? "").trim();
    if (fullName) return fullName;
  }
  return "Customer";
}

/**
 * Fan-out provider + customer notifications exactly once when a product order
 * first becomes paid. Call after `recordProductOrderPayment` (or equivalent)
 * with `transitionedToPaid` from that helper's return value.
 */
export async function notifyProductOrderPaidIfTransitioned(
  supabase: SupabaseClient,
  productOrderId: string,
  options: { transitionedToPaid: boolean },
): Promise<void> {
  if (!options.transitionedToPaid) return;

  const { data: order, error } = await (supabase.from("product_orders") as any)
    .select(
      `
      id,
      order_number,
      customer_id,
      provider_id,
      tenant_id,
      total_amount,
      wallet_amount,
      order_source,
      fulfillment_type,
      customer_name,
      items:product_order_items ( id )
    `,
    )
    .eq("id", productOrderId)
    .maybeSingle();

  if (error || !order) {
    console.warn("[notifyProductOrderPaid] order not found:", productOrderId, error);
    return;
  }

  const o = order as {
    order_number?: string;
    customer_id?: string;
    provider_id?: string;
    tenant_id?: string | null;
    total_amount?: number | string;
    wallet_amount?: number | string;
    order_source?: string | null;
    fulfillment_type?: string | null;
    customer_name?: string | null;
    items?: Array<{ id?: string }>;
  };

  const orderNumber = String(o.order_number ?? productOrderId);
  const totalAmount = Number(o.total_amount ?? 0);
  const walletAmount = Math.max(0, Number(o.wallet_amount ?? 0));
  const itemCount = Array.isArray(o.items) ? o.items.length : undefined;
  const providerId = o.provider_id;
  const customerId = o.customer_id;

  const tenantId = await resolveTenantIdForFinanceLedger(supabase, {
    tenant_id: o.tenant_id ?? null,
    provider_id: providerId ?? null,
  });
  const { format: formatMoney } = await getTenantMoneyFormatter(tenantId);
  const message = formatPaidOrderMessage(formatMoney, orderNumber, totalAmount, walletAmount, itemCount);
  const actionUrl = `/provider/ecommerce/orders?order=${encodeURIComponent(productOrderId)}`;
  const metadata = {
    product_order_id: productOrderId,
    order_number: orderNumber,
    total_amount: totalAmount,
    wallet_amount: walletAmount,
  };

  if (providerId) {
    try {
      await notifyProviderTeamUsers(providerId, {
        type: "product_order_placed",
        title: "New Product Order",
        message,
        metadata,
        link: actionUrl,
        action_url: actionUrl,
      });

      const teamUserIds = await getProviderTeamUserIds(providerId);
      const customerLabel = await resolveProductOrderCustomerLabel(supabase, {
        order_source: o.order_source,
        customer_name: o.customer_name,
        customer_id: customerId,
      });
      const templateVars: Record<string, string> = {
        order_number: orderNumber,
        customer_name: customerLabel,
        total_amount: formatMoney(totalAmount),
        item_count: String(itemCount ?? 1),
        fulfillment_type: String(o.fulfillment_type ?? "collection"),
        dashboard_url: actionUrl,
        product_order_id: productOrderId,
      };
      if (teamUserIds.length > 0) {
        await sendTemplateNotification(
          "product_order_placed",
          teamUserIds,
          templateVars,
          ["push"],
          {
            appType: "provider",
            tenantId: tenantId ?? undefined,
            // notifyProviderTeamUsers already inserted the in-app bell rows for
            // the whole team above; skip the template auto-insert to avoid a
            // duplicate entry per team member.
            skipInApp: true,
          },
        );
        await Promise.all(
          teamUserIds.map((uid) =>
            syncPushBadgeCount(uid, { appType: "provider", tenantId: tenantId ?? undefined }),
          ),
        );
      }
    } catch (e) {
      console.warn("[notifyProductOrderPaid] provider team notify failed:", e);
    }
  }

  if (customerId) {
    try {
      await insertNotification({
        user_id: customerId,
        type: "product_order_update",
        title: "Order Confirmed",
        message: `Your order ${orderNumber} has been confirmed and paid.`,
        data: { product_order_id: productOrderId, amount: totalAmount, wallet_amount: walletAmount },
        action_url: "/product-orders",
      });
    } catch (e) {
      console.warn("[notifyProductOrderPaid] customer in-app notify failed:", e);
    }

    try {
      // The customer in-app bell row was inserted manually above; suppress the
      // template auto-insert so the customer doesn't get two "order" entries.
      await notifyOrderConfirmation(customerId, productOrderId, orderNumber, totalAmount, ["push", "email"], {
        skipInApp: true,
      });
    } catch (e) {
      console.warn("[notifyProductOrderPaid] customer template notify failed:", e);
    }
  }
}

/**
 * Pay-on-delivery / cash orders: notify provider once at placement (not paid yet).
 */
export async function notifyProductOrderPlacedPendingPayment(params: {
  providerId: string;
  productOrderId: string;
  orderNumber: string;
  totalAmount: number;
  tenantId: string;
  itemCount: number;
  paymentMethod: "cash" | "card_on_delivery" | string;
}): Promise<void> {
  const { format: formatMoney } = await getTenantMoneyFormatter(params.tenantId);
  const payLabel =
    params.paymentMethod === "card_on_delivery" ? "card on delivery" : "cash on delivery";
  const message = `New order ${params.orderNumber} received — ${formatMoney(params.totalAmount)} (${params.itemCount} item${params.itemCount === 1 ? "" : "s"}, ${payLabel})`;
  const actionUrl = `/provider/ecommerce/orders?order=${encodeURIComponent(params.productOrderId)}`;

  await notifyProviderTeamUsers(params.providerId, {
    type: "product_order_placed",
    title: "New Product Order",
    message,
    metadata: {
      product_order_id: params.productOrderId,
      order_number: params.orderNumber,
      total_amount: params.totalAmount,
      payment_pending: true,
    },
    link: actionUrl,
    action_url: actionUrl,
  });
}
