import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
  getProviderIdForUser,
} from "@/lib/supabase/api-helpers";
import { verifyAccount } from "@/lib/payments/paystack-complete";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { getEffectiveSkipPayoutAccountVerification } from "@/lib/payments/payout-account-verification-settings";
import { z } from "zod";

const verifySchema = z.object({
  account_number: z.string().min(8).max(20),
  bank_code: z.string().min(1),
});

/**
 * POST /api/provider/payout-accounts/verify
 *
 * Verify bank account number with Paystack (resolve account name).
 * Use before creating a transfer recipient to ensure correct account details.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }
    // §payout-account-fix 2026-05: admin client for the tenant lookup so this
    // works for staff whose RLS view of `providers` may be limited.
    const admin = getSupabaseAdmin();
    const { data: provRow } = await admin
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    if (
      !resourceTenantMatchesHostTenant(
        tenantId,
        (provRow as { tenant_id?: string | null } | null)?.tenant_id,
      )
    ) {
      return errorResponse(
        "Your provider account is not on this market. Use the site or app for the correct region.",
        "TENANT_MISMATCH",
        403,
      );
    }

    const body = await request.json();
    const validationResult = verifySchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }))
      );
    }

    const { account_number, bank_code } = validationResult.data;

    const { skip: skipVerify } = await getEffectiveSkipPayoutAccountVerification(admin, tenantId);
    if (skipVerify) {
      return errorResponse(
        "Account verification is disabled for this market. Enter the account holder name manually.",
        "VERIFICATION_DISABLED",
        403,
      );
    }

    let result;
    try {
      result = await verifyAccount({ account_number, bank_code }, { tenantId });
    } catch (paystackErr: any) {
      // Paystack throws a plain Error (with .message set to the API message)
      // when the HTTP response is non-2xx.  Surface that as a 400 so the
      // client gets a readable explanation rather than a generic 500.
      const msg: string =
        paystackErr?.message ||
        "Account verification is unavailable. Please enter your account holder name manually.";
      return errorResponse(msg, "PAYSTACK_ERROR", 400);
    }

    if (!result.status || !result.data) {
      return errorResponse(
        result.message ||
          "Account could not be verified. Please enter your account holder name manually.",
        "PAYSTACK_ERROR",
        400
      );
    }

    return successResponse({
      account_name: result.data.account_name,
      account_number: result.data.account_number,
    });
  } catch (error) {
    return handleApiError(error, "Failed to verify bank account");
  }
}
