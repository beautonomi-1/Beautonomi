import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  handleApiError,
  notFoundResponse,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { isFeatureEnabledServer } from "@/lib/server/feature-flags";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  checkNewGateFeatureAccess,
  SUBSCRIPTION_FEATURE_KEYS,
} from "@/lib/subscriptions/feature-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  resolveCustomerProviderConversation,
  updateConversationAfterMessage,
} from "@/lib/chat/resolve-conversation";
import { insertNotifications } from "@/lib/notifications/insert-notification";

const createOfferSchema = z.object({
  price: z.number().min(0),
  currency: z.string().min(3).max(5).optional(),
  duration_minutes: z.number().int().min(15).max(8 * 60),
  expiration_at: z.string(), // ISO
  notes: z.string().max(4000).optional().nullable(),
  staff_id: z.string().uuid().optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  scheduled_at: z.string().optional().nullable(), // ISO or datetime-local string; proposed appointment time when paid
  travel_fee: z.number().min(0).optional().nullable(), // For at_home requests
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      (prow as { tenant_id?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const lastResortCurrency =
      (await getTenantRegionConfig(effectiveTenantId))?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    if (!(await isFeatureEnabledServer(FEATURE_FLAG_KEYS.PROVIDER_CUSTOM_OFFERS, effectiveTenantId))) {
      return errorResponse(
        "Custom offers are disabled for this market or your workspace. If this is unexpected, contact support — you can enable them from admin feature flags (commerce.provider_custom_offers).",
        "CUSTOM_OFFERS_DISABLED",
        403,
      );
    }

    const customRequestsOk = await checkNewGateFeatureAccess(
      providerId,
      SUBSCRIPTION_FEATURE_KEYS.customRequests,
      supabase,
    );
    if (!customRequestsOk) {
      return errorResponse(
        "Custom requests are not included on your current subscription plan. Upgrade to send offers.",
        "SUBSCRIPTION_FEATURE_DISABLED",
        403,
      );
    }

    const { id } = await params;
    const parsed = createOfferSchema.parse(await request.json());
    const body = { ...parsed, currency: parsed.currency ?? lastResortCurrency };

    // Ensure request belongs to this provider
    const { data: reqRow } = await supabase
      .from("custom_requests")
      .select("id, customer_id, provider_id, status, expires_at, providers!custom_requests_provider_id_fkey(business_name)")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();
    if (!reqRow) return notFoundResponse("Custom request not found");

    type ReqRow = {
      customer_id?: string;
      status?: string;
      expires_at?: string | null;
      providers?: { business_name?: string };
    };
    const req = reqRow as ReqRow;
    const customerId = req.customer_id ?? "";

    // §custom-requests-lifecycle-2026-05: cannot send an offer once the
    // request is closed. Cancelled / fulfilled / expired requests should not
    // be re-opened by a late provider response — that confused customers and
    // produced "ghost" offers attached to abandoned requests.
    const closedStatuses = new Set(["cancelled", "fulfilled", "expired"]);
    if (req.status && closedStatuses.has(req.status)) {
      return errorResponse(
        `This custom request is ${req.status} and can no longer receive offers.`,
        "REQUEST_CLOSED",
        409,
      );
    }
    if (req.expires_at && new Date(req.expires_at).getTime() < Date.now()) {
      // Lazy expire here too so subsequent fetches reflect the closed state.
      try {
        await supabase
          .from("custom_requests")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", id)
          .in("status", ["pending", "offered"]);
      } catch (lazyErr) {
        console.warn("[provider/custom-requests/offers] lazy expire failed:", lazyErr);
      }
      return errorResponse(
        "This custom request expired before you could send an offer.",
        "REQUEST_EXPIRED",
        410,
      );
    }

    // Validate staff_id and location_id belong to this provider
    if (body.staff_id) {
      const { data: staffRow } = await supabase
        .from("provider_staff")
        .select("id")
        .eq("id", body.staff_id)
        .eq("provider_id", providerId)
        .single();
      if (!staffRow) return handleApiError(new Error("Staff not found"), "Invalid staff", 400);
    }
    if (body.location_id) {
      const { data: locRow } = await supabase
        .from("provider_locations")
        .select("id")
        .eq("id", body.location_id)
        .eq("provider_id", providerId)
        .single();
      if (!locRow) return handleApiError(new Error("Location not found"), "Invalid location", 400);
    }

    const expDate = new Date(body.expiration_at);
    if (Number.isNaN(expDate.getTime()) || expDate.getTime() <= Date.now()) {
      return errorResponse(
        "Offer expiration must be in the future so the customer has time to accept.",
        "INVALID_EXPIRATION",
        400,
      );
    }
    const expIso = expDate.toISOString();
    const scheduledIso = body.scheduled_at ? new Date(body.scheduled_at).toISOString() : null;

    const travelFeeAmount = body.travel_fee != null && body.travel_fee >= 0 ? Number(body.travel_fee) : 0;
    const { data: offer, error } = await supabase
      .from("custom_offers")
      .insert({
        request_id: id,
        provider_id: providerId,
        price: body.price,
        currency: body.currency,
        duration_minutes: body.duration_minutes,
        expiration_at: expIso,
        notes: body.notes ?? null,
        staff_id: body.staff_id ?? null,
        location_id: body.location_id ?? null,
        scheduled_at: scheduledIso,
        travel_fee: travelFeeAmount,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    // Mark request as offered
    await supabase
      .from("custom_requests")
      .update({ status: "offered", updated_at: new Date().toISOString() })
      .eq("id", id);

    // Also send via messages: post an offer message in the customer<->provider conversation
    let conversationIdForNotify: string | null = null;
    try {
      const admin = getSupabaseAdmin();
      const { id: convId } = await resolveCustomerProviderConversation(admin, {
        customerId,
        providerId,
        lastMessageSenderId: user.id,
      });
      conversationIdForNotify = convId;

      const messageContent = `Custom offer: ${body.currency} ${body.price} • ${body.duration_minutes} mins`;
      const offerId = (offer as { id: string }).id;
      const { error: messageError } = await admin.from("messages").insert({
        conversation_id: convId,
        sender_id: user.id,
        sender_role: user.role,
        content: messageContent,
        attachments: [
          {
            type: "custom_offer",
            status: "pending",
            request_id: id,
            offer_id: offerId,
            price: body.price,
            currency: body.currency,
            duration_minutes: body.duration_minutes,
            expiration_at: expIso,
            preferred_start_at: scheduledIso,
          },
        ],
        is_read: false,
        created_at: new Date().toISOString(),
      });

      if (messageError) {
        console.error("[provider/custom-requests/offers] Failed to insert message:", messageError);
      } else {
        await updateConversationAfterMessage(admin, convId, user.id, messageContent);
      }
    } catch (msgErr) {
      console.error("[provider/custom-requests/offers] messaging failed:", msgErr);
    }

    // Notify customer using template (best-effort)
    try {
      const { sendTemplateNotification } = await import("@/lib/notifications/onesignal");
      const providerName = req?.providers?.business_name ?? "A provider";
      const offerId = (offer as { id: string }).id;
      const checkoutUrl = `/account-settings/custom-requests?request_id=${id}&offer=${encodeURIComponent(offerId)}`;

      await sendTemplateNotification(
        "customer_custom_offer",
        [customerId],
        {
          provider_name: providerName,
          price: body.price.toString(),
          currency: body.currency,
          request_id: id,
          offer_id: offerId,
        },
        ["push", "email"],
        { appType: "customer" },
      );

      await insertNotifications([
        {
          user_id: customerId,
          type: "custom_offer",
          title: "Custom Offer Received",
          message: `${providerName} sent you an offer for ${body.currency} ${body.price}. Tap to review and accept.`,
          data: {
            request_id: id,
            offer_id: offerId,
            conversation_id: conversationIdForNotify,
          },
          action_url: checkoutUrl,
        },
      ]);
    } catch (notifyErr) {
      console.error("[provider/custom-requests/offers] notification failed:", notifyErr);
    }

    return successResponse(offer);
  } catch (error) {
    return handleApiError(error, "Failed to create custom offer");
  }
}

