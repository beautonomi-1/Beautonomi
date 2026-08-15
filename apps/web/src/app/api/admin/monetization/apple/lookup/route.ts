import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { loadAppleIapConfig } from "@/lib/iap/apple/config";
import {
  fetchAppleRefundHistory,
  fetchAppleSubscriptionStatuses,
  fetchAppleTransactionHistory,
  fetchAppleTransactionInfo,
  lookupAppleOrder,
  tryEnvironments,
} from "@/lib/iap/apple/app-store-api";
import {
  parseAppleTransactionJws,
  verifyAndParseAppleTransactionJws,
} from "@/lib/iap/apple/jws";

function summarizeSigned(signed: string): Record<string, unknown> | { raw_error: string } {
  try {
    const tx = verifyAndParseAppleTransactionJws(signed);
    return {
      transaction_id: tx.transactionId,
      original_transaction_id: tx.originalTransactionId,
      product_id: tx.productId,
      purchase_date: tx.purchaseDate,
      expires_date: tx.expiresDate ?? null,
      environment: tx.environment ?? null,
      offer_type: tx.offerType ?? null,
      offer_identifier: tx.offerIdentifier ?? null,
      revocation_date: tx.revocationDate ?? null,
    };
  } catch {
    try {
      const tx = parseAppleTransactionJws(signed);
      return {
        transaction_id: tx.transactionId,
        original_transaction_id: tx.originalTransactionId,
        product_id: tx.productId,
        purchase_date: tx.purchaseDate,
        expires_date: tx.expiresDate ?? null,
        environment: tx.environment ?? null,
      };
    } catch (error) {
      return { raw_error: error instanceof Error ? error.message : "unreadable JWS" };
    }
  }
}

/**
 * GET /api/admin/monetization/apple/lookup
 * Look up an App Store order, transaction, or subscription lineage.
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id")?.trim() || "";
    const transactionId = searchParams.get("transaction_id")?.trim() || "";
    const originalTransactionId = searchParams.get("original_transaction_id")?.trim() || "";
    const preferred =
      searchParams.get("environment") === "Sandbox" ? "Sandbox" : "Production";

    if (!orderId && !transactionId && !originalTransactionId) {
      return errorResponse(
        "Provide order_id, transaction_id, or original_transaction_id",
        "VALIDATION_ERROR",
        400,
      );
    }

    const supabase = getSupabaseAdmin();
    const config = await loadAppleIapConfig(supabase);
    if (!config) {
      return errorResponse("Apple IAP is not configured", "IAP_NOT_CONFIGURED", 503);
    }

    let local: Record<string, unknown> | null = null;
    if (transactionId) {
      const { data } = await supabase
        .from("apple_iap_transactions")
        .select(
          "transaction_id, original_transaction_id, provider_id, product_id, purchase_date, expires_date, environment, price_zar, attribution_status, offer_identifier, revocation_date",
        )
        .eq("transaction_id", transactionId)
        .maybeSingle();
      local = (data as Record<string, unknown> | null) ?? null;
    } else if (originalTransactionId) {
      const { data } = await supabase
        .from("apple_iap_transactions")
        .select(
          "transaction_id, original_transaction_id, provider_id, product_id, purchase_date, expires_date, environment, price_zar, attribution_status, offer_identifier, revocation_date",
        )
        .eq("original_transaction_id", originalTransactionId)
        .order("purchase_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      local = (data as Record<string, unknown> | null) ?? null;
    }

    const apple: Record<string, unknown> = {};

    if (orderId) {
      const looked = await tryEnvironments(
        (environment) => lookupAppleOrder(config, orderId, environment),
        preferred,
      );
      apple.order = {
        environment: looked.environment,
        status: looked.result.status,
        transactions: (looked.result.signedTransactions ?? []).map(summarizeSigned),
      };
    }

    if (transactionId) {
      const looked = await tryEnvironments(
        (environment) => fetchAppleTransactionInfo(config, transactionId, environment),
        preferred,
      );
      apple.transaction = {
        environment: looked.environment,
        ...(looked.result.signedTransactionInfo
          ? summarizeSigned(looked.result.signedTransactionInfo)
          : {}),
      };
    }

    const orderOriginalId = (() => {
      const order = apple.order as { transactions?: Array<{ original_transaction_id?: string }> } | undefined;
      const first = order?.transactions?.[0];
      return typeof first?.original_transaction_id === "string" ? first.original_transaction_id.trim() : "";
    })();

    const lineageId =
      originalTransactionId ||
      (typeof local?.original_transaction_id === "string" ? local.original_transaction_id : "") ||
      (typeof apple.transaction === "object" &&
      apple.transaction &&
      "original_transaction_id" in apple.transaction
        ? String((apple.transaction as { original_transaction_id?: string }).original_transaction_id ?? "")
        : "") ||
      orderOriginalId;

    if (lineageId) {
      try {
        const statuses = await tryEnvironments(
          (environment) => fetchAppleSubscriptionStatuses(config, lineageId, environment),
          preferred,
        );
        apple.subscription_status = { environment: statuses.environment, payload: statuses.result };
      } catch (error) {
        apple.subscription_status = {
          error: error instanceof Error ? error.message : "not a subscription lineage",
        };
      }

      try {
        const history = await tryEnvironments(
          (environment) => fetchAppleTransactionHistory(config, lineageId, environment),
          preferred,
        );
        apple.history = {
          environment: history.environment,
          transactions: (history.result.signedTransactions ?? []).map(summarizeSigned),
          has_more: history.result.hasMore ?? false,
        };
      } catch (error) {
        apple.history = {
          error: error instanceof Error ? error.message : "history unavailable",
        };
      }

      try {
        const refunds = await tryEnvironments(
          (environment) => fetchAppleRefundHistory(config, lineageId, environment),
          preferred,
        );
        apple.refund_history = {
          environment: refunds.environment,
          transactions: (refunds.result.signedTransactions ?? []).map(summarizeSigned),
          has_more: refunds.result.hasMore ?? false,
        };
      } catch (error) {
        apple.refund_history = {
          error: error instanceof Error ? error.message : "refund history unavailable",
        };
      }
    }

    return successResponse({
      local,
      apple,
      note: "Apple does not provide a developer-initiated IAP refund. Refund history is what Apple already refunded. Grant time with POST /extend. Answer an outstanding CONSUMPTION_REQUEST with POST /consumption.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
