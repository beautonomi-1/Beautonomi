import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";
import { patchCustomOfferMessageAttachments } from "@/lib/custom-offers/sync-offer-message-attachments";
import { creditWalletForCustomOfferAbandon } from "@/lib/custom-offers/credit-wallet-for-offer-abandon";
import { getNotificationTemplate, sendTemplateNotification, sendToUser } from "@/lib/notifications/onesignal";

type ExpiredRequestRow = {
  id: string;
  customer_id: string;
  provider_id: string;
};

type ExpiredOfferRow = {
  id: string;
  request_id: string;
  provider_id: string;
  request?: { customer_id?: string } | null;
};

async function notifyExpiredRequestBestEffort(row: ExpiredRequestRow): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    let providerName = "your provider";
    let customerName = "A customer";

    const [{ data: provRow }, { data: custProf }] = await Promise.all([
      admin.from("providers").select("business_name, user_id").eq("id", row.provider_id).maybeSingle(),
      admin.from("user_profiles").select("full_name").eq("user_id", row.customer_id).maybeSingle(),
    ]);

    const bn = (provRow as { business_name?: string } | null)?.business_name;
    if (bn && bn.trim()) providerName = bn.trim();
    const fn = (custProf as { full_name?: string } | null)?.full_name;
    if (fn && fn.trim()) customerName = fn.trim();

    const customerTemplate = await getNotificationTemplate("customer_custom_request_expired");
    if (customerTemplate?.enabled) {
      await sendTemplateNotification(
        "customer_custom_request_expired",
        [row.customer_id],
        { provider_name: providerName, request_id: row.id },
        customerTemplate.channels || ["push", "email"],
        { appType: "customer" },
      );
    } else {
      await sendToUser(
        row.customer_id,
        {
          title: "Request expired",
          message: `Your custom request to ${providerName} has expired.`,
          data: { type: "customer_custom_request_expired", request_id: row.id },
          url: `/account-settings/custom-requests?request_id=${encodeURIComponent(row.id)}`,
        },
        ["push", "email"],
        { appType: "customer" },
      );
    }

    const providerUserId = (provRow as { user_id?: string } | null)?.user_id;
    if (providerUserId) {
      const providerTemplate = await getNotificationTemplate("provider_custom_request_expired");
      if (providerTemplate?.enabled) {
        await sendTemplateNotification(
          "provider_custom_request_expired",
          [providerUserId],
          { customer_name: customerName, request_id: row.id },
          providerTemplate.channels || ["push", "email"],
          { appType: "provider" },
        );
      } else {
        await sendToUser(
          providerUserId,
          {
            title: "Request expired",
            message: `A custom request from ${customerName} has expired.`,
            data: { type: "provider_custom_request_expired", request_id: row.id },
            url: `/provider/custom-requests/${row.id}`,
          },
          ["push", "email"],
          { appType: "provider" },
        );
      }
    }
  } catch (err) {
    console.warn("[expire-custom-requests] notify request failed:", row.id, err);
  }
}

async function notifyExpiredOfferBestEffort(row: ExpiredOfferRow): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const customerId = row.request?.customer_id;
    if (!customerId) {
      const { data: reqRow } = await admin
        .from("custom_requests")
        .select("customer_id")
        .eq("id", row.request_id)
        .maybeSingle();
      if (!(reqRow as { customer_id?: string } | null)?.customer_id) return;
      row = { ...row, request: { customer_id: (reqRow as { customer_id: string }).customer_id } };
    }

    let providerName = "your provider";
    const { data: provRow } = await admin
      .from("providers")
      .select("business_name")
      .eq("id", row.provider_id)
      .maybeSingle();
    const bn = (provRow as { business_name?: string } | null)?.business_name;
    if (bn && bn.trim()) providerName = bn.trim();

    const customerIdFinal = row.request?.customer_id;
    if (!customerIdFinal) return;

    const template = await getNotificationTemplate("customer_custom_offer_expired");
    if (template?.enabled) {
      await sendTemplateNotification(
        "customer_custom_offer_expired",
        [customerIdFinal],
        {
          provider_name: providerName,
          offer_id: row.id,
          request_id: row.request_id,
        },
        template.channels || ["push", "email"],
        { appType: "customer" },
      );
    } else {
      await sendToUser(
        customerIdFinal,
        {
          title: "Offer expired",
          message: `Your custom offer from ${providerName} has expired.`,
          data: {
            type: "customer_custom_offer_expired",
            offer_id: row.id,
            request_id: row.request_id,
          },
          url: `/account-settings/custom-requests?request_id=${encodeURIComponent(row.request_id)}&offer_id=${encodeURIComponent(row.id)}`,
        },
        ["push", "email"],
        { appType: "customer" },
      );
    }
  } catch (err) {
    console.warn("[expire-custom-requests] notify offer failed:", row.id, err);
  }
}

/**
 * GET /api/cron/expire-custom-requests
 *
 * Cleans up stale `custom_requests` and `custom_offers` once their `expires_at`
 * / `expiration_at` timestamp has passed. Mirrors `expire-on-demand-requests`.
 *
 * Without this, abandoned custom requests stay in `pending`/`offered` and the
 * customer-side inbox + provider-side "needs response" badge never settle.
 *
 * §custom-requests-lifecycle-2026-05
 */
export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error ?? "Unauthorized", { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: staleRequests, error: requestError } = await admin
      .from("custom_requests")
      .update({ status: "expired", updated_at: now })
      .in("status", ["pending", "offered"])
      .lt("expires_at", now)
      .select("id, customer_id, provider_id");

    if (requestError) throw requestError;

    const expiredRequestIds = (staleRequests ?? []).map((r: ExpiredRequestRow) => r.id);
    let cascadedOfferIds: string[] = [];

    if (expiredRequestIds.length > 0) {
      // Claim payment_pending offers first so we can refund any upfront wallet debit
      // before the status flips to expired (cancel-payment becomes a no-op after).
      const { data: pendingPaymentOffers } = await admin
        .from("custom_offers")
        .select("id, provider_id, request:custom_requests(customer_id)")
        .eq("status", "payment_pending")
        .in("request_id", expiredRequestIds);

      for (const row of (pendingPaymentOffers ?? []) as Array<{
        id: string;
        provider_id?: string | null;
        request?: { customer_id?: string | null } | null;
      }>) {
        const customerId = row.request?.customer_id;
        if (!customerId) continue;
        try {
          await creditWalletForCustomOfferAbandon(
            admin,
            row.id,
            customerId,
            row.provider_id ?? null,
            { reason: "expired" },
          );
        } catch (walletErr) {
          console.error(
            `[expire-custom-requests] wallet refund failed for payment_pending offer ${row.id}:`,
            walletErr,
          );
        }
      }

      const { data: cascadedOffers } = await admin
        .from("custom_offers")
        .update({ status: "expired", updated_at: now })
        .in("status", ["pending", "changes_requested", "payment_pending"])
        .in("request_id", expiredRequestIds)
        .select("id");

      cascadedOfferIds = (cascadedOffers ?? []).map((o: { id: string }) => o.id);
      for (const oid of cascadedOfferIds) {
        await patchCustomOfferMessageAttachments(admin, oid, { status: "expired" });
      }
    }

    const { data: staleOffers, error: offerError } = await admin
      .from("custom_offers")
      .update({ status: "expired", updated_at: now })
      .in("status", ["pending", "changes_requested"])
      .lt("expiration_at", now)
      .select("id, request_id, provider_id, request:custom_requests(customer_id)");

    if (offerError) throw offerError;

    const standaloneExpiredOffers = (staleOffers ?? []) as ExpiredOfferRow[];
    for (const offer of standaloneExpiredOffers) {
      if (!cascadedOfferIds.includes(offer.id)) {
        await patchCustomOfferMessageAttachments(admin, offer.id, { status: "expired" });
      }
    }

    for (const req of (staleRequests ?? []) as ExpiredRequestRow[]) {
      await notifyExpiredRequestBestEffort(req);
    }
    for (const offer of standaloneExpiredOffers) {
      if (!cascadedOfferIds.includes(offer.id)) {
        await notifyExpiredOfferBestEffort(offer);
      }
    }

    return successResponse({
      message: "Expired custom requests and offers updated",
      expired_requests: staleRequests?.length ?? 0,
      expired_offers: (standaloneExpiredOffers.length || 0),
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to expire custom requests");
  }
}
