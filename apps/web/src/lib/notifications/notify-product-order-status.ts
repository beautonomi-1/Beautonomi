import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";
import { dispatchTemplateNotification } from "@/lib/notifications/dispatch-template-notification";

const TEMPLATE_BY_STATUS = {
  confirmed: "product_order_confirmed",
  shipped: "product_order_shipped",
  ready_for_collection: "product_order_ready_collection",
  delivered: "product_order_delivered",
  cancelled: "product_order_cancelled",
  refunded: "product_order_refunded",
} as const;

export type ProductOrderNotifyStatus = keyof typeof TEMPLATE_BY_STATUS;

export interface NotifyProductOrderStatusChangeParams {
  customerId: string;
  status: ProductOrderNotifyStatus;
  orderId: string;
  orderNumber: string;
  tenantId?: string | null;
  providerName?: string;
  cancellationReason?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  estimatedDelivery?: string | null;
  collectionLocationName?: string | null;
  collectionLocationAddress?: string | null;
  refundAmountFormatted?: string | null;
}

export interface DispatchProductOrderStatusNotificationParams {
  supabase: SupabaseClient;
  customerId: string;
  status: ProductOrderNotifyStatus;
  orderId: string;
  orderNumber: string;
  tenantId?: string | null;
  providerId?: string | null;
  collectionLocationId?: string | null;
  cancellationReason?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  estimatedDelivery?: string | null;
  refundAmount?: number | null;
}

/**
 * Send push + email (and in-app bell row) when a product order status changes.
 * Mirrors booking cancellation: awaited dispatch via seeded notification templates.
 */
export async function notifyProductOrderStatusChange(
  params: NotifyProductOrderStatusChangeParams,
): Promise<void> {
  const templateKey = TEMPLATE_BY_STATUS[params.status];
  if (!templateKey) return;

  const estimatedDelivery = params.estimatedDelivery ?? "";
  const trackingNumber = params.trackingNumber ?? "";
  const carrier = params.carrier ?? "";

  try {
    await dispatchTemplateNotification(
      templateKey,
      [params.customerId],
      {
        order_number: params.orderNumber,
        order_id: params.orderId,
        provider_name: params.providerName ?? "",
        cancellation_reason: params.cancellationReason ?? "",
        tracking_number: trackingNumber,
        estimated_delivery: estimatedDelivery,
        location_name: params.collectionLocationName ?? "",
        location_address: params.collectionLocationAddress ?? "",
        refund_amount: params.refundAmountFormatted ?? "",
        estimated_info: estimatedDelivery ? `Estimated delivery: ${estimatedDelivery}` : "",
        carrier,
      },
      ["push", "email"],
      { appType: "customer", tenantId: params.tenantId ?? undefined },
    );
  } catch (e) {
    console.warn(`[notifyProductOrderStatusChange] ${templateKey} failed`, e);
  }
}

function formatCollectionAddress(loc: {
  name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}): string {
  return [loc.address_line1, loc.address_line2, loc.city, loc.state, loc.postal_code]
    .filter(Boolean)
    .join(", ");
}

/**
 * Resolve provider/collection context then dispatch the status notification.
 * Used by provider PATCH, admin PATCH, and cron auto-cancel routes.
 */
export async function dispatchProductOrderStatusNotification(
  params: DispatchProductOrderStatusNotificationParams,
): Promise<void> {
  const {
    supabase,
    customerId,
    status,
    orderId,
    orderNumber,
    tenantId,
    providerId,
    collectionLocationId,
    cancellationReason,
    trackingNumber,
    carrier,
    estimatedDelivery,
    refundAmount,
  } = params;

  let providerName = "";
  if (providerId && (status === "confirmed" || status === "cancelled" || status === "refunded")) {
    const { data: providerRow } = await (supabase.from("providers") as any)
      .select("business_name")
      .eq("id", providerId)
      .maybeSingle();
    providerName =
      (providerRow as { business_name?: string } | null)?.business_name ?? "Your provider";
  }

  let collectionLocationName: string | null = null;
  let collectionLocationAddress: string | null = null;
  if (status === "ready_for_collection" && collectionLocationId) {
    const { data: loc } = await (supabase.from("provider_locations") as any)
      .select("name, address_line1, address_line2, city, state, postal_code")
      .eq("id", collectionLocationId)
      .maybeSingle();
    if (loc) {
      collectionLocationName = (loc as { name?: string }).name ?? null;
      collectionLocationAddress = formatCollectionAddress(loc as Record<string, string | null>);
    }
  }

  let refundAmountFormatted: string | null = null;
  if (status === "refunded" && refundAmount != null && Number.isFinite(refundAmount)) {
    const { format: formatMoney } = await getTenantMoneyFormatter(tenantId ?? null);
    refundAmountFormatted = formatMoney(refundAmount);
  }

  await notifyProductOrderStatusChange({
    customerId,
    status,
    orderId,
    orderNumber,
    tenantId,
    providerName,
    cancellationReason,
    trackingNumber,
    carrier,
    estimatedDelivery,
    collectionLocationName,
    collectionLocationAddress,
    refundAmountFormatted,
  });
}
