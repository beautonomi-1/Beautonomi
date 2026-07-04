import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchTemplateNotification, withTenantVariable } from "@/lib/notifications/dispatch-template-notification";

export async function notifyTerminalOrderDispatched(
  supabase: SupabaseClient,
  terminalOrderId: string,
  opts?: { trackingUrl?: string | null; estimatedDelivery?: string | null },
): Promise<void> {
  const { data: order } = await (supabase.from("terminal_orders") as any)
    .select(
      `id, tenant_id, tracking_reference, courier_name,
       providers(id, business_name, user_id),
       terminal_products(id, name)`,
    )
    .eq("id", terminalOrderId)
    .maybeSingle();

  if (!order) return;
  const o = order as {
    id: string;
    tenant_id?: string | null;
    tracking_reference?: string | null;
    courier_name?: string | null;
    providers?: { business_name?: string | null; user_id?: string | null } | null;
    terminal_products?: { name?: string | null } | null;
  };

  const userId = o.providers?.user_id;
  if (!userId) return;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const trackingParams = new URLSearchParams({ order: o.id });
  if (o.tracking_reference) trackingParams.set("tracking", o.tracking_reference);
  if (o.courier_name) trackingParams.set("courier", o.courier_name);
  const trackingUrl =
    opts?.trackingUrl ?? `${appUrl}/provider/settings/sales/terminal-shop?${trackingParams.toString()}`;

  await dispatchTemplateNotification(
    "terminal_order_dispatched",
    [userId],
    withTenantVariable(o.tenant_id, {
      business_name: o.providers?.business_name ?? "Provider",
      product_name: o.terminal_products?.name ?? "Terminal device",
      order_id: o.id,
      estimated_delivery: opts?.estimatedDelivery ?? "soon",
      tracking_url: trackingUrl,
      app_url: appUrl,
    }),
    ["push", "email", "sms"],
    { appType: "provider" },
  );
}

export async function notifyTerminalOrderReadyForCollection(
  supabase: SupabaseClient,
  terminalOrderId: string,
  collectionLocationName: string,
): Promise<void> {
  const { data: order } = await (supabase.from("terminal_orders") as any)
    .select(
      `id, tenant_id,
       providers(id, business_name, user_id),
       terminal_products(id, name)`,
    )
    .eq("id", terminalOrderId)
    .maybeSingle();

  if (!order) return;
  const o = order as {
    id: string;
    tenant_id?: string | null;
    providers?: { business_name?: string | null; user_id?: string | null } | null;
    terminal_products?: { name?: string | null } | null;
  };

  const userId = o.providers?.user_id;
  if (!userId) return;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

  await dispatchTemplateNotification(
    "terminal_order_ready_for_collection",
    [userId],
    withTenantVariable(o.tenant_id, {
      business_name: o.providers?.business_name ?? "Provider",
      product_name: o.terminal_products?.name ?? "Terminal device",
      order_id: o.id,
      collection_location: collectionLocationName,
      app_url: appUrl,
    }),
    ["push", "email"],
    { appType: "provider" },
  );
}
