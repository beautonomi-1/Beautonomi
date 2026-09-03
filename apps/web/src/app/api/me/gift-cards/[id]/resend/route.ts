import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { checkGiftCardResendRateLimit } from "@/lib/rate-limit/gift-card-resend";
import { deliverGiftCardOrderNow, normalizeRecipientPhone } from "@/lib/gift-cards/gift-card-delivery";

const bodySchema = z
  .object({
    recipient_email: z.string().trim().email().max(254).optional().nullable(),
    recipient_phone: z.string().trim().max(32).optional().nullable(),
  })
  .partial();

/**
 * POST /api/me/gift-cards/[id]/resend
 *
 * Re-sends a purchased gift card to its recipient (email and/or SMS). Only the
 * purchaser of the order may resend, and it is rate limited to 3 per card per day.
 * Optional body overrides let the buyer fix a typo in the recipient contact.
 *
 * @tenant-hint Service-role reads are scoped to the authenticated purchaser
 *   (order.purchaser_user_id === user.id) after requireRoleInApi.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireRoleInApi(
      ["customer", "provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const { id } = await params;
    const supabaseAdmin = getSupabaseAdmin();

    let body: z.infer<typeof bodySchema> = {};
    try {
      const raw = await request.json();
      const parsed = bodySchema.safeParse(raw ?? {});
      if (!parsed.success) {
        return errorResponse("Invalid request body", "VALIDATION_ERROR", 400);
      }
      body = parsed.data;
    } catch {
      body = {};
    }

    const { data: card, error: cardErr } = await supabaseAdmin
      .from("gift_cards")
      .select("id, metadata, is_active")
      .eq("id", id)
      .maybeSingle();
    if (cardErr) throw cardErr;
    if (!card) return notFoundResponse("Gift card not found");

    // Resolve the order: FK on the order (first card) or metadata.order_id (bulk siblings).
    const metaOrderId = (card.metadata as Record<string, unknown> | null)?.order_id;
    let orderQuery = supabaseAdmin
      .from("gift_card_orders")
      .select("id, purchaser_user_id, status, deliver_at, delivered_at, delivery_channel");
    orderQuery =
      typeof metaOrderId === "string" && metaOrderId.length > 0
        ? orderQuery.or(`id.eq.${metaOrderId},gift_card_id.eq.${id}`)
        : orderQuery.eq("gift_card_id", id);
    const { data: orderRows, error: orderErr } = await orderQuery.limit(1);
    if (orderErr) throw orderErr;
    const order = (orderRows || [])[0] as
      | {
          id: string;
          purchaser_user_id: string | null;
          status: string;
          deliver_at: string | null;
          delivered_at: string | null;
          delivery_channel: string | null;
        }
      | undefined;
    if (!order) return notFoundResponse("Gift card order not found");

    if (order.purchaser_user_id !== user.id) {
      return errorResponse("Only the purchaser can resend this gift card", "FORBIDDEN", 403);
    }
    if (order.status !== "paid") {
      return errorResponse("This gift card order has not been paid", "ORDER_NOT_PAID", 409);
    }
    if (card.is_active === false) {
      return errorResponse("This gift card is no longer active", "GIFT_CARD_INACTIVE", 409);
    }

    const rate = await checkGiftCardResendRateLimit(user.id, id);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "You can resend a gift card at most 3 times per day.",
            code: "RATE_LIMITED",
            retry_after_seconds: rate.retryAfterSeconds ?? null,
          },
        },
        {
          status: 429,
          headers: rate.retryAfterSeconds ? { "Retry-After": String(rate.retryAfterSeconds) } : undefined,
        },
      );
    }

    const overrideEmail = body.recipient_email ? body.recipient_email.toLowerCase() : null;
    const overridePhone = body.recipient_phone ? normalizeRecipientPhone(body.recipient_phone) : null;
    if (body.recipient_phone && !overridePhone) {
      return errorResponse("Invalid recipient phone number", "RECIPIENT_PHONE_INVALID", 400);
    }

    const result = await deliverGiftCardOrderNow({
      supabase: supabaseAdmin,
      orderId: order.id,
      force: true,
      overrideRecipientEmail: overrideEmail,
      overrideRecipientPhone: overridePhone,
    });

    if (result.skipped === "no_recipient") {
      return errorResponse(
        "No recipient contact on file. Provide recipient_email or recipient_phone.",
        "NO_RECIPIENT",
        400,
      );
    }

    void writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "customer",
      action: "customer.gift_card.resend",
      entity_type: "gift_card",
      entity_id: id,
      module: "wallet",
      risk_level: "low",
      retention_tier: "routine",
      metadata: {
        order_id: order.id,
        emailed: result.emailed,
        sms_sent: result.smsSent,
        override_email: Boolean(overrideEmail),
        override_phone: Boolean(overridePhone),
      },
      ...extractRequestMeta(request),
    });

    return successResponse({
      order_id: order.id,
      emailed: result.emailed,
      sms_sent: result.smsSent,
      remaining_today: rate.remaining,
    });
  } catch (error) {
    return handleApiError(error, "Failed to resend gift card");
  }
}
