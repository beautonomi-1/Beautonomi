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

    if (o.terminal_products?.integration_vendor_slug === "paycloud") {
      try {
        const { data: orderRow, error: orderSelectError } = await supabase
          .from("terminal_orders")
          .select(
            "provider_id, tenant_id, collection_location_id, terminal_products(name), terminal_assets(id, serial_number)",
          )
          .eq("id", terminalOrderId)
          .maybeSingle();
        if (orderSelectError) {
          console.error(
            "[finalizeTerminalOrderAfterPayment] PayCloud bridge order select failed:",
            orderSelectError,
          );
        }
        const assets = (orderRow as { terminal_assets?: unknown } | null)?.terminal_assets;
        const asset = Array.isArray(assets) ? assets[0] : assets;
        const productName = (() => {
          const products = (orderRow as { terminal_products?: { name?: string } | { name?: string }[] | null })
            ?.terminal_products;
          if (Array.isArray(products)) return products[0]?.name;
          return products?.name;
        })();
        if (orderRow?.provider_id && orderRow?.tenant_id && asset?.serial_number) {
          const { registerPaycloudTerminalFromAsset } = await import(
            "@/lib/terminal/register-paycloud-terminal-from-asset"
          );
          await registerPaycloudTerminalFromAsset(supabase, {
            terminalAssetId: asset.id,
            providerId: orderRow.provider_id,
            tenantId: orderRow.tenant_id,
            locationId: orderRow.collection_location_id,
            serialNumber: asset.serial_number,
            displayName: productName ?? "Beautonomi Card Machine",
          });
        }
      } catch (paycloudErr) {
        console.error("[finalizeTerminalOrderAfterPayment] PayCloud registry bridge failed:", paycloudErr);
      }
    }
  }

  const needsSetup = o.terminal_products?.requires_integration_setup === true;
  if (needsSetup) {
    const vendorSlug = (
      o.terminal_products?.integration_vendor_slug ?? o.terminal_products?.vendor ?? ""
    )
      .trim()
      .toLowerCase();

    const { data: orderGateRow } = await supabase
      .from("terminal_orders")
      .select("provider_id, tenant_id, integration_setup_status, merchant_application_id")
      .eq("id", terminalOrderId)
      .maybeSingle();

    const gateStatus = (orderGateRow as { integration_setup_status?: string } | null)
      ?.integration_setup_status;

    if (gateStatus !== "awaiting_merchant_onboarding") {
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
    } else if (vendorSlug === "paycloud" && orderGateRow?.provider_id && orderGateRow?.tenant_id) {
      try {
        const { clearMerchantOnboardingGateForOrder } = await import("@/lib/terminal-merchant/gate");
        await clearMerchantOnboardingGateForOrder(
          supabase,
          terminalOrderId,
          orderGateRow.provider_id as string,
          vendorSlug,
        );
      } catch (gateErr) {
        console.error("[finalizeTerminalOrderAfterPayment] merchant onboarding gate clear failed:", gateErr);
      }
    }
  }
}

export { markPendingIntegrationOrdersComplete };
