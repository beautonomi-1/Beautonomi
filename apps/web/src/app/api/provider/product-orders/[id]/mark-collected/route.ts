import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  errorResponse,
  getProviderIdForUser,
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";

const markCollectedSchema = z.object({
  payment_method: z.enum(["cash", "card_on_delivery", "yoco"]),
  reference: z.string().trim().max(200).optional(),
  idempotency_key: z.string().trim().max(200).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const body = markCollectedSchema.parse(await request.json());
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: order, error: orderError } = await (supabase.from("product_orders") as any)
      .select("id, provider_id, order_number, total_amount, payment_status, payment_method, status")
      .eq("id", id)
      .eq("provider_id", providerId)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) return notFoundResponse("Order not found");
    if (["cancelled", "refunded"].includes(String(order.status ?? ""))) {
      return errorResponse("Cannot collect payment for a cancelled or refunded order.", "INVALID_STATUS", 400);
    }

    const explicitReference = body.reference?.trim() || null;
    const idempotencyKey =
      body.idempotency_key?.trim() || request.headers.get("Idempotency-Key")?.trim() || null;
    if (body.payment_method === "yoco" && !explicitReference) {
      return errorResponse(
        "Yoco collections require the terminal payment reference.",
        "YOCO_REFERENCE_REQUIRED",
        400,
      );
    }

    const reference =
      explicitReference ||
      idempotencyKey ||
      `product_collect_${id}_${body.payment_method}`;

    const result = await recordProductOrderPayment({
      supabase: supabase as never,
      productOrderId: id,
      reference,
      amountMajor: Number(order.total_amount || 0),
      feesMajor: 0,
      source: "provider_mark_collected",
      provider: body.payment_method,
      platformHeld: false,
    });

    return successResponse({
      order_id: id,
      duplicate: result.duplicate,
      message: result.duplicate ? "Payment collection already recorded" : "Payment collection recorded",
    });
  } catch (err) {
    return handleApiError(err, "Failed to mark product order payment as collected");
  }
}
