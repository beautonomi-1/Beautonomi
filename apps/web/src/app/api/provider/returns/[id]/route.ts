import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { z } from "zod";
import { getTenantMoneyFormatter } from "@/lib/money/tenant-intl-format";

/** Exported for contract tests; keep in sync with mobile `PATCH` bodies. */
export const updateSchema = z.object({
  action: z.enum(["approve", "reject", "mark_received", "process_refund"]),
  provider_notes: z.string().max(500).optional(),
  return_method: z.enum(["drop_off", "courier", "not_required"]).optional(),
  resolution: z.enum(["full_refund", "partial_refund", "replacement", "store_credit", "denied"]).optional(),
  refund_processed_amount: z.number().min(0).optional(),
});

const STATUS_TRANSITIONS: Record<string, Record<string, string>> = {
  pending: { approve: "approved", reject: "rejected" },
  approved: { mark_received: "item_received" },
  item_received: { process_refund: "refunded" },
};

/**
 * GET /api/provider/returns/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data, error } = await supabase.from("product_return_requests")
      .select(
        `*,
        order:product_orders(order_number, total_amount, fulfillment_type, items:product_order_items(*)),
        customer:users!product_return_requests_customer_id_fkey(id, full_name, email, phone, avatar_url)`,
      )
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (error || !data) return notFoundResponse("Return request not found");
    return successResponse({ return_request: data });
  } catch (err) {
    return handleApiError(err, "Failed to fetch return request");
  }
}

/**
 * PATCH /api/provider/returns/[id] — provider actions on a return
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const body = await request.json();
    const parsed = updateSchema.parse(body);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: req } = await supabase.from("product_return_requests")
      .select("id, status, refund_amount, order_id, quantity, order_item_id, customer_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    type ReturnRequestRow = { id: string; status: string; refund_amount?: number; order_id?: string; quantity?: number; order_item_id?: string; customer_id?: string };
    const reqRow = req as ReturnRequestRow | null;
    if (!reqRow) return notFoundResponse("Return request not found");

    const transitions = STATUS_TRANSITIONS[reqRow.status];
    if (!transitions || !transitions[parsed.action]) {
      return errorResponse(
        `Cannot perform "${parsed.action}" on a return with status "${reqRow.status}"`,
        "INVALID_TRANSITION",
        400,
      );
    }

    const update: Record<string, unknown> = {
      status: transitions[parsed.action],
    };

    if (parsed.provider_notes) update.provider_notes = parsed.provider_notes;

    if (parsed.action === "approve") {
      update.approved_at = new Date().toISOString();
      update.return_method = parsed.return_method ?? "drop_off";
      update.resolution = parsed.resolution ?? "full_refund";
    }

    if (parsed.action === "reject") {
      update.rejected_at = new Date().toISOString();
      update.resolution = "denied";
    }

    if (parsed.action === "mark_received") {
      update.item_received_at = new Date().toISOString();
    }

    if (parsed.action === "process_refund") {
      update.refunded_at = new Date().toISOString();
      update.refund_processed_amount =
        parsed.refund_processed_amount ?? Number(reqRow.refund_amount);
      update.refund_method = "original_payment";
      update.resolved_by = user.id;

      // Restore stock (variant or product-level)
      if (reqRow.order_item_id) {
        const { data: orderItem } = await supabase.from("product_order_items")
          .select("product_id, product_variant_id, quantity")
          .eq("id", reqRow.order_item_id)
          .single();
        if (orderItem) {
          const qty = reqRow.quantity ?? (orderItem as { quantity?: number }).quantity ?? 1;
          if (orderItem.product_variant_id) {
            try {
              await supabase.rpc("increment_product_variant_stock", {
                p_variant_id: orderItem.product_variant_id,
                p_quantity: qty,
              });
            } catch {
              const { data: v } = await supabase.from("product_variants")
                .select("quantity")
                .eq("id", orderItem.product_variant_id)
                .single();
              const variantRow = v as { quantity?: number } | null;
              if (variantRow) {
                await supabase.from("product_variants")
                  .update({ quantity: (variantRow.quantity ?? 0) + qty })
                  .eq("id", orderItem.product_variant_id);
              }
            }
          } else {
            const { data: prod } = await supabase.from("products")
              .select("quantity")
              .eq("id", orderItem.product_id)
              .single();
            const prodRow = prod as { quantity?: number } | null;
            if (prodRow) {
              await supabase.from("products")
                .update({ quantity: (prodRow.quantity ?? 0) + qty })
                .eq("id", orderItem.product_id);
            }
          }
        }
      }
    }

    const { data, error } = await supabase.from("product_return_requests")
      .update(update)
      .eq("id", id)
      .select("*, order:product_orders(order_number)")
      .single();

    if (error) throw error;

    const orderNumber = (data as { order?: { order_number?: string } })?.order?.order_number;
    const refundAmt = Number(update.refund_processed_amount ?? reqRow.refund_amount);
    let processRefundMessage = "";
    if (parsed.action === "process_refund") {
      let refundTenantId: string | null | undefined;
      if (reqRow.order_id) {
        const { data: ord } = await supabase
          .from("product_orders")
          .select("tenant_id")
          .eq("id", reqRow.order_id)
          .maybeSingle();
        refundTenantId = (ord as { tenant_id?: string | null } | null)?.tenant_id ?? undefined;
      }
      if (!refundTenantId) {
        const { data: pr } = await supabase
          .from("providers")
          .select("tenant_id")
          .eq("id", providerId)
          .maybeSingle();
        refundTenantId = (pr as { tenant_id?: string | null } | null)?.tenant_id ?? undefined;
      }
      const { format } = await getTenantMoneyFormatter(refundTenantId);
      processRefundMessage = `Your refund of ${format(refundAmt)} for order ${orderNumber} has been processed.`;
    }
    // Notify customer of return status change
    const notifMap: Record<string, { type: string; title: string; message: string }> = {
      approve: {
        type: "product_return_approved",
        title: "Return Approved",
        message: `Your return request for order ${orderNumber} has been approved.`,
      },
      reject: {
        type: "product_return_rejected",
        title: "Return Update",
        message: `Your return request for order ${orderNumber} was not approved.${parsed.provider_notes ? ` Reason: ${parsed.provider_notes}` : ""} You can escalate if needed.`,
      },
      process_refund: {
        type: "product_return_refunded",
        title: "Refund Processed",
        message: processRefundMessage,
      },
    };

    const notif = notifMap[parsed.action];
    if (notif && reqRow.customer_id) {
      void import("@/lib/notifications/insert-notification").then(({ insertNotification }) =>
        insertNotification({
          user_id: reqRow.customer_id,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          data: { return_request_id: id },
          action_url: "/product-orders",
        })
      );
    }

    return successResponse({ return_request: data });
  } catch (err) {
    return handleApiError(err, "Failed to update return request");
  }
}
