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

const updateSchema = z.object({
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

    const { data, error } = await (supabase.from("product_return_requests") as any)
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

    const { data: req } = await (supabase.from("product_return_requests") as any)
      .select("id, status, refund_amount, order_id, quantity, order_item_id, customer_id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!req) return notFoundResponse("Return request not found");

    const transitions = STATUS_TRANSITIONS[req.status];
    if (!transitions || !transitions[parsed.action]) {
      return errorResponse(
        `Cannot perform "${parsed.action}" on a return with status "${req.status}"`,
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
        parsed.refund_processed_amount ?? Number(req.refund_amount);
      update.refund_method = "original_payment";
      update.resolved_by = user.id;

      // Restore stock
      if (req.order_item_id) {
        const { data: orderItem } = await (supabase.from("product_order_items") as any)
          .select("product_id")
          .eq("id", req.order_item_id)
          .single();
        if (orderItem) {
          const { data: prod } = await (supabase.from("products") as any)
            .select("quantity")
            .eq("id", orderItem.product_id)
            .single();
          if (prod) {
            await (supabase.from("products") as any)
              .update({ quantity: prod.quantity + req.quantity })
              .eq("id", orderItem.product_id);
          }
        }
      }
    }

    const { data, error } = await (supabase.from("product_return_requests") as any)
      .update(update)
      .eq("id", id)
      .select("*, order:product_orders(order_number)")
      .single();

    if (error) throw error;

    // Notify customer of return status change
    const notifMap: Record<string, { type: string; title: string; message: string }> = {
      approve: {
        type: "product_return_approved",
        title: "Return Approved",
        message: `Your return request for order ${data?.order?.order_number} has been approved.`,
      },
      reject: {
        type: "product_return_rejected",
        title: "Return Update",
        message: `Your return request for order ${data?.order?.order_number} was not approved.${parsed.provider_notes ? ` Reason: ${parsed.provider_notes}` : ""} You can escalate if needed.`,
      },
      process_refund: {
        type: "product_return_refunded",
        title: "Refund Processed",
        message: `Your refund of R${Number(update.refund_processed_amount ?? req.refund_amount).toFixed(2)} for order ${data?.order?.order_number} has been processed.`,
      },
    };

    const notif = notifMap[parsed.action];
    if (notif && req.customer_id) {
      await supabase.from("notifications").insert({
        user_id: (req as any).customer_id ?? data.customer_id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        metadata: { return_request_id: id },
        link: "/product-orders",
      }).then(() => {}, () => {});
    }

    return successResponse({ return_request: data });
  } catch (err) {
    return handleApiError(err, "Failed to update return request");
  }
}
