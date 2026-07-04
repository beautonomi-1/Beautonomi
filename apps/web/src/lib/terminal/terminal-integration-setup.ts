import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchTemplateNotification, withTenantVariable } from "@/lib/notifications/dispatch-template-notification";
import { resolveIntegrationSetupUrl } from "@/lib/terminal/resolve-integration-setup-url";

export async function notifyTerminalIntegrationSetupRequired(
  supabase: SupabaseClient,
  terminalOrderId: string,
): Promise<void> {
  const { data: order } = await (supabase.from("terminal_orders") as any)
    .select(
      `id, tenant_id, integration_setup_status,
       providers(id, business_name, user_id),
       terminal_products(id, name, vendor, integration_vendor_slug)`,
    )
    .eq("id", terminalOrderId)
    .maybeSingle();

  if (!order) return;
  const o = order as {
    id: string;
    tenant_id?: string | null;
    integration_setup_status?: string;
    providers?: { business_name?: string | null; user_id?: string | null } | null;
    terminal_products?: { name?: string | null; vendor?: string; integration_vendor_slug?: string | null } | null;
  };

  if (o.integration_setup_status !== "pending") return;
  const userId = o.providers?.user_id;
  if (!userId || !o.terminal_products) return;

  const setupUrl = resolveIntegrationSetupUrl(o.terminal_products, o.id);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const vendorName = (o.terminal_products.vendor ?? "terminal").replace(/_/g, " ");

  await dispatchTemplateNotification(
    "terminal_integration_setup_required",
    [userId],
    withTenantVariable(o.tenant_id, {
      business_name: o.providers?.business_name ?? "Provider",
      product_name: o.terminal_products.name ?? "Terminal device",
      order_id: o.id,
      vendor_name: vendorName,
      setup_url: setupUrl,
      app_url: appUrl,
    }),
    ["push", "email"],
    { appType: "provider" },
  );
}

export async function markPendingIntegrationOrdersComplete(
  supabase: SupabaseClient,
  providerId: string,
  vendorSlug: string,
): Promise<number> {
  const slug = vendorSlug.trim().toLowerCase();
  const { data: orders } = await supabase
    .from("terminal_orders")
    .select("id, terminal_products(vendor, integration_vendor_slug)")
    .eq("provider_id", providerId)
    .in("integration_setup_status", ["pending", "in_progress"])
    .eq("invoice_status", "paid");

  const matchingIds = (orders ?? [])
    .filter((row) => {
      const p = (row as { terminal_products?: { vendor?: string; integration_vendor_slug?: string | null } })
        .terminal_products;
      if (!p) return false;
      const orderSlug = (p.integration_vendor_slug ?? p.vendor ?? "").trim().toLowerCase();
      if (slug === "yoco" && orderSlug === "yoco") return true;
      return orderSlug === slug;
    })
    .map((row) => (row as { id: string }).id);

  if (matchingIds.length === 0) return 0;

  const now = new Date().toISOString();
  await supabase
    .from("terminal_orders")
    .update({
      integration_setup_status: "completed",
      integration_completed_at: now,
    })
    .in("id", matchingIds);

  return matchingIds.length;
}
