import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyAccount } from "@/lib/payments/paystack-complete";
import { z } from "zod";

const verifySchema = z.object({
  account_number: z.string().min(8).max(15),
  bank_code: z.string().min(1),
});/**
 * POST /api/provider/payout-accounts/verify
 *
 * Verify bank account number with Paystack (resolve account name).
 * Use before creating a transfer recipient to ensure correct account details.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["provider_owner", "provider_staff"], request);

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

    const result = await verifyAccount({
      account_number,
      bank_code,
    });

    if (!result.status || !result.data) {
      return errorResponse(
        result.message || "Account verification failed",
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
