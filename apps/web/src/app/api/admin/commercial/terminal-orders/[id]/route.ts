/**
 * PATCH /api/admin/commercial/terminal-orders/[id] — update order status / fulfillment / record payment
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { recordTerminalOrderPayment } from "@/lib/terminal/record-terminal-order-payment";
import {
  ensureTerminalAssetsForOrder,
  syncTerminalAssetStatusForOrder,
} from "@/lib/terminal/create-terminal-asset-from-order";

const updateOrderSchema = z.object({
  order_status: z
    .enum([
      "pending",
      "confirmed",
      "processing",
      "dispatched",
      "delivered",
      "cancelled",
      "refunded",
      "failed",
    ])
    .optional(),
  fulfillment_status: z
    .enum(["pending", "picking", "packed", "dispatched", "delivered", "returned", "failed"])
    .optional(),
  invoice_status: z.enum(["pending", "issued", "paid", "void", "refunded"]).optional(),
  invoice_number: z.string().optional().nullable(),
  admin_notes: z.string().optional().nullable(),
  cancellation_reason: z.string().optional().nullable(),
  tracking_reference: z.string().optional().nullable(),
  courier_name: z.string().optional().nullable(),
  /** When true, records payment in finance ledger (manual invoice / bank transfer). */
  record_payment: z.boolean().optional(),
  payment_reference: z.string().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { user: adminUser } = await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data: existing, error: loadErr } = await supabase
      .from("terminal_orders")
      .select("*")
      .eq("id", params.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (loadErr) {
      return errorResponse("Failed to load order", "LOAD_ERROR", 500, loadErr);
    }
    if (!existing) {
      return errorResponse("Order not found", "NOT_FOUND", 404);
    }

    const body = await request.json();
    const validation = updateOrderSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, validation.error.issues);
    }

    const { record_payment, payment_reference, ...patchFields } = validation.data;

    let financeTransactionId = (existing as { finance_transaction_id?: string | null }).finance_transaction_id ?? null;

    if (record_payment && !financeTransactionId) {
      const reference =
        payment_reference?.trim() ||
        `terminal_order_manual_${params.id}_${Date.now()}`;
      const amountMajor = Number((existing as { total_amount?: number }).total_amount ?? 0);
      const commercialModel = (existing as { commercial_model?: string }).commercial_model as
        | "once_off_purchase"
        | "rental"
        | "subscription_bundle"
        | "lease_to_own"
        | "financed"
        | "promotional";

      try {
        const paymentResult = await recordTerminalOrderPayment({
          supabase,
          terminalOrderId: params.id,
          reference,
          amountMajor,
          commercialModel,
          source: "manual_invoice",
          provider: "manual",
        });
        financeTransactionId = paymentResult.financeTransactionId;
        if (paymentResult.transitionedToPaid) {
          const { notifyTerminalOrderPaidIfTransitioned } = await import(
            "@/lib/terminal/notify-terminal-order-paid"
          );
          await notifyTerminalOrderPaidIfTransitioned(supabase, params.id, {
            transitionedToPaid: true,
          });
        }
      } catch (payErr) {
        const message = payErr instanceof Error ? payErr.message : "Failed to record payment";
        return errorResponse(message, "PAYMENT_RECORD_ERROR", 500, payErr);
      }
    }

    if (validation.data.order_status === "dispatched") {
      const integrationStatus = String(
        (existing as { integration_setup_status?: string }).integration_setup_status ?? "",
      );
      if (integrationStatus === "awaiting_merchant_onboarding") {
        return errorResponse(
          "Cannot dispatch: merchant onboarding must be approved first.",
          "MERCHANT_ONBOARDING_REQUIRED",
          409,
        );
      }
    }

    const updates = {
      ...patchFields,
      ...(record_payment && !patchFields.invoice_status ? { invoice_status: "paid" as const } : {}),
      ...(record_payment && !patchFields.order_status ? { order_status: "confirmed" as const } : {}),
      ...(financeTransactionId ? { finance_transaction_id: financeTransactionId } : {}),
    };

    const { data, error } = await supabase
      .from("terminal_orders")
      .update(updates)
      .eq("id", params.id)
      .eq("tenant_id", tenantId)
      .select(
        `*,
        providers(id, business_name, slug),
        terminal_products(id, name, vendor, model),
        terminal_collection_locations(id, name, address)`,
      )
      .single();

    if (error) {
      return errorResponse("Failed to update order", "SAVE_ERROR", 500, error);
    }

    const prevInvoiceStatus = String((existing as { invoice_status?: string }).invoice_status ?? "");
    const newInvoiceStatus = String(
      (data as { invoice_status?: string }).invoice_status ?? prevInvoiceStatus,
    );
    if (newInvoiceStatus === "paid" && prevInvoiceStatus !== "paid" && !record_payment) {
      try {
        const { finalizeTerminalOrderAfterPayment } = await import(
          "@/lib/terminal/finalize-terminal-order-after-payment"
        );
        await finalizeTerminalOrderAfterPayment({ supabase, terminalOrderId: params.id });
      } catch (finalizeErr) {
        console.error("[terminal-orders] finalize on manual paid failed:", finalizeErr);
      }
    }

    const updated = data as { order_status?: string; id?: string };
    const newStatus = validation.data.order_status ?? (existing as { order_status?: string }).order_status;
    const prevStatus = (existing as { order_status?: string }).order_status;

    if (
      ["confirmed", "processing", "dispatched", "delivered"].includes(String(newStatus ?? "")) &&
      !["cancelled", "refunded", "failed"].includes(String(prevStatus ?? ""))
    ) {
      try {
        await ensureTerminalAssetsForOrder(supabase, params.id);
      } catch (assetErr) {
        console.error("[terminal-orders] asset creation failed:", assetErr);
      }
    }
    if (validation.data.order_status) {
      try {
        await syncTerminalAssetStatusForOrder(supabase, params.id, validation.data.order_status);
      } catch (syncErr) {
        console.error("[terminal-orders] asset sync failed:", syncErr);
      }
    }

    const prevFulfillment = (existing as { fulfillment_status?: string }).fulfillment_status;
    const newFulfillment =
      validation.data.fulfillment_status ??
      (data as { fulfillment_status?: string }).fulfillment_status;
    const fulfillmentType = (data as { fulfillment_type?: string }).fulfillment_type;

    if (
      validation.data.order_status === "dispatched" &&
      (existing as { order_status?: string }).order_status !== "dispatched"
    ) {
      try {
        const { notifyTerminalOrderDispatched } = await import(
          "@/lib/terminal/notify-terminal-order-fulfillment"
        );
        await notifyTerminalOrderDispatched(supabase, params.id);
      } catch (notifyErr) {
        console.error("[terminal-orders] dispatch notify failed:", notifyErr);
      }
    }

    if (
      fulfillmentType === "collection" &&
      newFulfillment === "packed" &&
      prevFulfillment !== "packed"
    ) {
      try {
        const { notifyTerminalOrderReadyForCollection } = await import(
          "@/lib/terminal/notify-terminal-order-fulfillment"
        );
        const loc = (data as { terminal_collection_locations?: { name?: string } | null })
          .terminal_collection_locations;
        await notifyTerminalOrderReadyForCollection(
          supabase,
          params.id,
          loc?.name ?? "collection point",
        );
      } catch (notifyErr) {
        console.error("[terminal-orders] collection notify failed:", notifyErr);
      }
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: adminUser.id,
      actor_role: adminUser.role ?? "superadmin",
      action: record_payment ? "admin.terminal_order.payment_recorded" : "admin.terminal_order.updated",
      entity_type: "terminal_orders",
      entity_id: params.id,
      module: "terminal_commerce",
      before_json: existing,
      after_json: data,
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ order: data, finance_transaction_id: financeTransactionId });
  } catch (error) {
    return handleApiError(error, "Failed to update terminal order");
  }
}
