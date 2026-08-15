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
import { loadAppleIapConfig } from "@/lib/iap/apple/config";
import { extendAppleSubscriptionRenewal, tryEnvironments } from "@/lib/iap/apple/app-store-api";

const bodySchema = z.object({
  original_transaction_id: z.string().min(4),
  extend_by_days: z.number().int().min(1).max(90),
  /** 1 customer satisfaction, 2 other, 3 service issue */
  extend_reason_code: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  environment: z.enum(["Production", "Sandbox"]).optional(),
  provider_id: z.string().uuid().optional(),
});

/**
 * POST /api/admin/monetization/apple/extend
 *
 * Complimentary days via App Store Server API. This is how support grants time:
 * Apple remains the merchant of record and the next paid renewal shifts out.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["superadmin"], request);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400, parsed.error.flatten());
    }

    const supabase = getSupabaseAdmin();
    const config = await loadAppleIapConfig(supabase);
    if (!config) {
      return errorResponse("Apple IAP is not configured", "IAP_NOT_CONFIGURED", 503);
    }

    const { data: sub } = await supabase
      .from("provider_subscriptions")
      .select("provider_id, expires_at, apple_environment, apple_original_transaction_id")
      .eq("apple_original_transaction_id", parsed.data.original_transaction_id)
      .eq("billing_provider", "apple")
      .maybeSingle();
    const row = sub as {
      provider_id: string;
      expires_at?: string | null;
      apple_environment?: "Production" | "Sandbox" | null;
    } | null;

    const environment =
      parsed.data.environment ??
      (row?.apple_environment === "Sandbox" ? "Sandbox" : "Production");

    const apple = await tryEnvironments(
      (env) =>
        extendAppleSubscriptionRenewal(config, {
          originalTransactionId: parsed.data.original_transaction_id,
          extendByDays: parsed.data.extend_by_days,
          extendReasonCode: parsed.data.extend_reason_code,
          environment: env,
        }),
      environment,
    );

    if (apple.result.success === false) {
      return errorResponse(
        "Apple did not apply the extension. Complimentary days are only granted when the App Store accepts the request.",
        "APPLE_EXTEND_DECLINED",
        409,
        apple.result,
      );
    }

    let nextExpires: string | null = null;
    if (apple.result.effectiveDate) {
      nextExpires = new Date(apple.result.effectiveDate).toISOString();
    }

    if (row && nextExpires) {
      await supabase
        .from("provider_subscriptions")
        .update({
          expires_at: nextExpires,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("provider_id", row.provider_id);
    }

    await writeAuditLog({
      actor_user_id: user.id,
      action: "admin.monetization.apple.subscription.extended",
      entity_type: "provider_subscriptions",
      entity_id: row?.provider_id ?? parsed.data.original_transaction_id,
      after_json: {
        original_transaction_id: parsed.data.original_transaction_id,
        extend_by_days: parsed.data.extend_by_days,
        extend_reason_code: parsed.data.extend_reason_code,
        environment: apple.environment,
        expires_at: nextExpires,
        apple: apple.result,
      },
    });

    return successResponse({
      ok: true,
      environment: apple.environment,
      expires_at: nextExpires,
      apple: apple.result,
      note: nextExpires
        ? "Apple accepted the extension. Local expiry matches Apple's effectiveDate until the EXTEND notification arrives."
        : "Apple accepted the extension. Local expiry will update when the EXTEND notification or reconcile cron lands.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
