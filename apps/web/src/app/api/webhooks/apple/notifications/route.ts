import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  applyAppleRenewalInfo,
  handleAppleSubscriptionExpired,
  processAppleSignedTransaction,
} from "@/lib/iap/apple/entitlement-bridge";
import {
  parseAppleTransactionJws,
  verifyAndParseAppleNotificationJws,
  verifyAndParseAppleRenewalInfoJws,
  verifyAndParseAppleTransactionJws,
} from "@/lib/iap/apple/jws";
import { loadAppleIapConfig } from "@/lib/iap/apple/config";
import { sendAppleConsumptionInformation } from "@/lib/iap/apple/app-store-api";
import { buildAppleConsumptionInformation } from "@/lib/iap/apple/consumption";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/apple/notifications
 * App Store Server Notifications V2
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  let rawBody = "";
  try {
    rawBody = await request.text();
    const envelope = JSON.parse(rawBody) as { signedPayload?: string };
    if (!envelope.signedPayload) {
      return NextResponse.json({ error: "missing signedPayload" }, { status: 400 });
    }

    /**
     * This endpoint is unauthenticated, so the JWS signature is the only proof
     * the payload came from Apple. Reject anything that fails verification
     * before it can touch entitlements or the ledger.
     */
    const config = await loadAppleIapConfig(supabase);
    let notification: ReturnType<typeof verifyAndParseAppleNotificationJws>;
    try {
      notification = verifyAndParseAppleNotificationJws(envelope.signedPayload, {
        expectedBundleId: config?.bundleId,
      });
    } catch (verifyError) {
      console.error("[webhook/apple] signature verification failed:", verifyError);
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }

    /**
     * Nested transaction / renewal JWSs are independently signed. Verify them
     * before taking a webhook lease so a bad inner payload cannot be marked
     * duplicate and then skipped on Apple's retry.
     */
    const signedTx = notification.data?.signedTransactionInfo;
    const signedRenewal = notification.data?.signedRenewalInfo;
    let renewal: ReturnType<typeof verifyAndParseAppleRenewalInfoJws> | null = null;
    try {
      if (signedTx) {
        verifyAndParseAppleTransactionJws(signedTx, {
          expectedBundleId: config?.bundleId,
        });
      }
      if (signedRenewal) {
        renewal = verifyAndParseAppleRenewalInfoJws(signedRenewal);
      }
    } catch (nestedError) {
      console.error("[webhook/apple] nested JWS verification failed:", nestedError);
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }

    const eventId = notification.notificationUUID || `apple:${notification.notificationType}:${Date.now()}`;

    const { data: leaseRow, error: leaseError } = await (supabase.rpc as any)(
      "try_acquire_webhook_event_lease",
      {
        p_event_id: String(eventId),
        p_source: "apple",
        p_event_type: notification.notificationType,
        p_payload: { subtype: notification.subtype },
        p_lease_seconds: 300,
      },
    );

    if (leaseError) {
      console.error("[webhook/apple] lease error:", leaseError);
      return NextResponse.json({ error: "lease_failed" }, { status: 500 });
    }
    if (leaseRow && (leaseRow as { duplicate?: boolean }).duplicate) {
      return NextResponse.json({ duplicate: true }, { status: 200 });
    }

    const environment =
      notification.data?.environment === "Sandbox" ? "Sandbox" : "Production";

    if (signedTx) {
      await processAppleSignedTransaction({
        supabase,
        signedTransaction: signedTx,
        notificationUuid: notification.notificationUUID,
      });
    }

    const type = notification.notificationType;
    const subtype = notification.subtype ?? "";

    if (renewal) {
      await applyAppleRenewalInfo({
        supabase,
        renewal,
        notificationType: type,
        subtype,
      });
    }

    if (
      (type === "EXPIRED" || type === "GRACE_PERIOD_EXPIRED" || type === "REVOKE") &&
      signedTx
    ) {
      const tx = parseAppleTransactionJws(signedTx);
      await handleAppleSubscriptionExpired(supabase, tx.originalTransactionId);
    }

    if ((type === "REFUND" || type === "REVOKE") && signedTx) {
      const tx = parseAppleTransactionJws(signedTx);
      const { loadAppleProductById } = await import("@/lib/iap/apple/registry");
      const product = await loadAppleProductById(supabase, tx.productId);
      const reason = type === "REVOKE" ? "Apple revoke" : "Apple refund";

      if (product?.kind === "consumable") {
        // Ads packs are funded through the budget order, so the reversal has to
        // unwind that order rather than the subscription ledger.
        const { data: orderRow } = await supabase
          .from("ads_budget_orders")
          .select("id")
          .eq("apple_transaction_id", tx.transactionId)
          .maybeSingle();
        const orderId = (orderRow as { id?: string } | null)?.id ?? null;
        if (orderId) {
          const { reverseAdsBudgetOrderPayment } = await import(
            "@/lib/ads/ads-budget-order-payment"
          );
          await reverseAdsBudgetOrderPayment({
            supabase,
            orderId,
            finalOrderStatus: "refunded",
            reason,
          });
        }
      } else {
        const { reverseProviderSubscriptionPayment } = await import(
          "@/lib/subscriptions/provider-subscription-payment"
        );
        await reverseProviderSubscriptionPayment({
          supabase,
          reason,
          reference: tx.transactionId,
        });
      }

      await supabase
        .from("apple_iap_transactions")
        .update({
          revocation_date: new Date().toISOString(),
          revocation_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("transaction_id", tx.transactionId);
    }

    if (type === "CONSUMPTION_REQUEST" && signedTx) {
      const tx = parseAppleTransactionJws(signedTx);
      const appleConfig = config ?? (await loadAppleIapConfig(supabase));
      if (appleConfig) {
        const body = await buildAppleConsumptionInformation({
          supabase,
          transactionId: tx.transactionId,
        });
        await sendAppleConsumptionInformation(
          appleConfig,
          tx.transactionId,
          body,
          environment,
        );
      }
    }

    await (supabase.from("webhook_events") as any)
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .eq("source", "apple");

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("[webhook/apple] handler error:", error);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }
}
