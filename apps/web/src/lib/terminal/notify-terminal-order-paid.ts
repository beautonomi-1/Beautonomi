import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchTemplateNotification, withTenantVariable } from "@/lib/notifications/dispatch-template-notification";
import { buildProviderTerminalOrderReceiptUrl } from "@/lib/receipts/receipt-download-token";

export async function notifyTerminalOrderPaidIfTransitioned(
  supabase: SupabaseClient,
  terminalOrderId: string,
  opts: { transitionedToPaid: boolean },
): Promise<void> {
  if (!opts.transitionedToPaid) return;

  const { data: order } = await (supabase.from("terminal_orders") as any)
    .select(
      `id, tenant_id, provider_id, total_amount, currency, commercial_model, paystack_reference,
       providers(id, business_name, user_id),
       terminal_products(id, name)`,
    )
    .eq("id", terminalOrderId)
    .maybeSingle();

  if (!order) return;

  const o = order as {
    id: string;
    tenant_id?: string | null;
    total_amount?: number;
    currency?: string;
    commercial_model?: string;
    paystack_reference?: string | null;
    providers?: { business_name?: string | null; user_id?: string | null } | null;
    terminal_products?: { name?: string | null } | null;
  };

  const userId = o.providers?.user_id;
  if (!userId) return;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const receiptUrl =
    buildProviderTerminalOrderReceiptUrl({
      terminalOrderId,
      userId,
    }) ?? `${appUrl}/provider/settings/sales/terminal-shop?order=${terminalOrderId}`;

  const vars = withTenantVariable(o.tenant_id, {
    business_name: o.providers?.business_name ?? "Provider",
    product_name: o.terminal_products?.name ?? "Terminal device",
    order_id: o.id,
    commercial_model: String(o.commercial_model ?? "").replace(/_/g, " "),
    total_amount: String(Number(o.total_amount ?? 0).toFixed(2)),
    currency: o.currency ?? "ZAR",
    amount: String(Number(o.total_amount ?? 0).toFixed(2)),
    reference: o.paystack_reference ?? o.id,
    payment_date: new Date().toLocaleDateString(),
    receipt_url: receiptUrl,
    app_url: appUrl,
    year: String(new Date().getFullYear()),
  });

  await dispatchTemplateNotification(
    "terminal_order_confirmed",
    [userId],
    vars,
    ["push", "email"],
    { appType: "provider" },
  );

  await dispatchTemplateNotification(
    "terminal_order_receipt",
    [userId],
    vars,
    ["email"],
    { appType: "provider" },
  );
}
