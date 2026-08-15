import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { writeAuditLog } from "@/lib/audit/audit";
import { processAppleSignedTransaction } from "@/lib/iap/apple/entitlement-bridge";

/** GET /api/admin/monetization/apple/transactions */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = (page - 1) * limit;
    const environment = searchParams.get("environment");
    const productId = searchParams.get("product_id");
    const attributionStatus = searchParams.get("attribution_status");

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("apple_iap_transactions")
      .select(
        "id, transaction_id, original_transaction_id, provider_id, product_id, transaction_type, purchase_date, expires_date, environment, price_zar, currency, attribution_status, notification_uuid, created_at",
        { count: "exact" },
      );

    if (environment) query = query.eq("environment", environment);

    if (productId) query = query.eq("product_id", productId);
    if (attributionStatus) query = query.eq("attribution_status", attributionStatus);

    const { data, error, count } = await query
      .order("purchase_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return successResponse({
      items: data ?? [],
      meta: {
        page,
        limit,
        total: count ?? 0,
        has_more: (count ?? 0) > offset + limit,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const replaySchema = z.object({
  transaction_id: z.string().min(1),
});

/**
 * POST /api/admin/monetization/apple/transactions
 *
 * Re-applies a stored transaction from its saved JWS. This is the recovery path
 * when a purchase landed before its product mapping existed, or when a
 * notification arrived while the transaction could not be attributed to a
 * business: fix the mapping, replay, and the entitlement and ledger catch up
 * without asking the customer to buy again. Re-running is safe because the
 * ledger helpers key on the Apple transaction id.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const parsed = replaySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.flatten());
    }

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("apple_iap_transactions")
      .select("transaction_id, provider_id, raw_jws")
      .eq("transaction_id", parsed.data.transaction_id)
      .maybeSingle();
    const tx = row as
      | { transaction_id: string; provider_id: string | null; raw_jws: string | null }
      | null;
    if (!tx) {
      return errorResponse("Apple transaction not found", "NOT_FOUND", 404);
    }
    if (!tx.raw_jws) {
      return errorResponse(
        "This transaction has no stored signed payload to replay",
        "NO_RAW_PAYLOAD",
        422,
      );
    }

    const result = await processAppleSignedTransaction({
      supabase,
      signedTransaction: tx.raw_jws,
      providerIdHint: tx.provider_id,
    });

    await writeAuditLog({
      actor_user_id: user.id,
      action: "admin.monetization.apple.transaction.replayed",
      entity_type: "apple_iap_transactions",
      entity_id: tx.transaction_id,
      after_json: {
        ok: result.ok,
        kind: result.kind,
        provider_id: result.providerId,
        error: result.error ?? null,
      },
    });

    if (!result.ok) {
      return errorResponse(
        result.error ?? "Replay failed",
        "REPLAY_FAILED",
        422,
        { transaction_id: result.transactionId, product_id: result.productId },
      );
    }

    return successResponse({
      replayed: true,
      transaction_id: result.transactionId,
      product_id: result.productId,
      kind: result.kind,
      provider_id: result.providerId,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
