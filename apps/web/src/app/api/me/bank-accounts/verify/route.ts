import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import {
  checkBankVerifyRateLimit,
  verifyCustomerBankAccount,
} from "@/lib/wallet-bank-refunds/verify-bank-account";

const verifySchema = z.object({
  account_number: z.string().min(8).max(20),
  bank_code: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const limit = await checkBankVerifyRateLimit(request, user.id);
    if (limit.allowed === false) {
      return errorResponse("Too many verification attempts. Try again later.", "RATE_LIMITED", 429);
    }
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const body = await request.json();
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400);
    }

    const admin = getSupabaseAdmin();
    try {
      const result = await verifyCustomerBankAccount({
        supabase: admin,
        tenantId,
        account_number: parsed.data.account_number,
        bank_code: parsed.data.bank_code,
      });
      return successResponse({ account_name: result.account_name, verified: true });
    } catch (verifyErr) {
      if (verifyErr instanceof Error && verifyErr.message === "VERIFICATION_DISABLED") {
        return successResponse({ account_name: null, verified: false, verification_available: false });
      }
      const msg =
        verifyErr instanceof Error
          ? verifyErr.message
          : "Account could not be verified. Check the account number and bank.";
      return errorResponse(msg, "ACCOUNT_VERIFICATION_FAILED", 400);
    }
  } catch (error) {
    return handleApiError(error, "Failed to verify bank account");
  }
}
