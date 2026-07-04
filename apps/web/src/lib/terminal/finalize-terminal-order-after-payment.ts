import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureTerminalAssetsForOrder } from "@/lib/terminal/create-terminal-asset-from-order";
import {
  markPendingIntegrationOrdersComplete,
  notifyTerminalIntegrationSetupRequired,
} from "@/lib/terminal/terminal-integration-setup";
import type { TerminalFulfillmentType } from "@/lib/terminal/terminal-order-fulfillment";

type FinalizeInput = {
  supabase: SupabaseClient;
  terminalOrderId: string;
};

export async function finalizeTerminalOrderAfterPayment(
  input: FinalizeInput,
): Promise<void> {
  const { supabase, terminalOrderId } = input;

  const { data: order } = await supabase
    .from("terminal_orders")
    .select(
      `id, fulfillment_type, commercial_model, invoice_status,
       terminal_products(id, vendor, requires_integration_setup, integration_vendor_slug)`,
    )
    .eq("id", terminalOrderId)
    .maybeSingle();

  if (!order || (order as { invoice_status?: string }).invoice_status !== "paid") {
    return;
  }

  const o = order as {
    fulfillment_type?: TerminalFulfillmentType | null;
    terminal_products?: {
      requires_integration_setup?: boolean;
      vendor?: string;
      integration_vendor_slug?: string | null;
    } | null;
  };

  const fulfillmentType = o.fulfillment_type;

  try {
    await ensureTerminalAssetsForOrder(supabase, terminalOrderId);
  } catch (err) {
    console.error("[finalizeTerminalOrderAfterPayment] asset creation failed:", err);
  }

  if (fulfillmentType === "digital_activation") {
    await supabase
      .from("terminal_orders")
      .update({
        order_status: "delivered",
        fulfillment_status: "delivered",
      })
      .eq("id", terminalOrderId);

    try {
      const { syncTerminalAssetStatusForOrder } = await import(
        "@/lib/terminal/create-terminal-asset-from-order"
      );
      await syncTerminalAssetStatusForOrder(supabase, terminalOrderId, "delivered");
    } catch (syncErr) {
      console.error("[finalizeTerminalOrderAfterPayment] asset sync failed:", syncErr);
    }
  }

  const needsSetup = o.terminal_products?.requires_integration_setup === true;
  if (needsSetup) {
    await supabase
      .from("terminal_orders")
      .update({ integration_setup_status: "pending" })
      .eq("id", terminalOrderId)
      .eq("integration_setup_status", "not_required");

    try {
      await notifyTerminalIntegrationSetupRequired(supabase, terminalOrderId);
    } catch (err) {
      console.error("[finalizeTerminalOrderAfterPayment] integration notify failed:", err);
    }
  }
}

export { markPendingIntegrationOrdersComplete };
