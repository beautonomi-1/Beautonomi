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
import { sendAppleConsumptionInformation, tryEnvironments } from "@/lib/iap/apple/app-store-api";
import {
  REFUND_PREFERENCE,
  buildAppleConsumptionInformation,
} from "@/lib/iap/apple/consumption";

const bodySchema = z.object({
  transaction_id: z.string().min(4),
  /** 1 prefer grant, 2 prefer decline. Omit to use computed usage. */
  refund_preference: z.union([z.literal(1), z.literal(2)]).optional(),
  environment: z.enum(["Production", "Sandbox"]).optional(),
});

/**
 * POST /api/admin/monetization/apple/consumption
 *
 * Send consumption information for an outstanding Apple CONSUMPTION_REQUEST.
 * This is the only supported way to influence an App Store refund. It does not
 * refund the customer itself.
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

    const { data: txRow } = await supabase
      .from("apple_iap_transactions")
      .select("transaction_id, environment")
      .eq("transaction_id", parsed.data.transaction_id)
      .maybeSingle();
    const tx = txRow as { transaction_id: string; environment?: string | null } | null;

    const body = await buildAppleConsumptionInformation({
      supabase,
      transactionId: parsed.data.transaction_id,
      refundPreferenceOverride: parsed.data.refund_preference,
    });

    const preferred =
      parsed.data.environment ??
      (tx?.environment === "Sandbox" ? "Sandbox" : "Production");

    const sent = await tryEnvironments(async (environment) => {
      await sendAppleConsumptionInformation(
        config,
        parsed.data.transaction_id,
        body,
        environment,
      );
      return environment;
    }, preferred);

    await writeAuditLog({
      actor_user_id: user.id,
      action: "admin.monetization.apple.consumption.sent",
      entity_type: "apple_iap_transactions",
      entity_id: parsed.data.transaction_id,
      after_json: {
        environment: sent.environment,
        local_row: Boolean(tx),
        refund_preference: body.refundPreference,
        consumption_status: body.consumptionStatus,
        preference_label:
          body.refundPreference === REFUND_PREFERENCE.GRANT
            ? "prefer_grant"
            : body.refundPreference === REFUND_PREFERENCE.DECLINE
              ? "prefer_decline"
              : "computed",
      },
    });

    return successResponse({
      ok: true,
      environment: sent.environment,
      local_row: Boolean(tx),
      consumption: body,
      note: "Sent to Apple as a refund-decision signal. Apple still decides the charge.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
