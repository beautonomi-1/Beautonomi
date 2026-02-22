import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
  errorResponse,
} from "@/lib/supabase/api-helpers";
import {
  createTransferRecipient,
  deleteTransferRecipient,
  verifyAccount,
} from "@/lib/payments/paystack-complete";
import { z } from "zod";

const createAccountSchema = z.object({
  type: z.enum(["nuban"]),
  account_number: z.string().min(8).max(15),
  bank_code: z.string().min(1),
  account_name: z.string().min(1),
  currency: z.string().min(1).default("ZAR"),
  country: z.string().optional(),
  /** If provided, server skips Paystack verify (saves cost: ZAR 3/call in South Africa). Use when client already called /verify. */
  verified_account_name: z.string().min(1).optional(),
  description: z.string().optional(),
  email: z.string().email().optional(),
});

/**
 * GET /api/provider/payout-accounts
 * 
 * List provider's payout accounts (bank accounts)
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: accounts, error } = await supabase
      .from("provider_payout_accounts")
      .select("*")
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return successResponse(accounts || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch payout accounts");
  }
}

/**
 * POST /api/provider/payout-accounts
 * 
 * Add a new bank account for payouts
 * Creates a Paystack transfer recipient and stores it
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const body = await request.json();
    const validationResult = createAccountSchema.safeParse(body);

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

    const { account_number, bank_code, account_name, type, currency, country, verified_account_name, description, email } = validationResult.data;

    // Superadmin-controlled: skip Paystack verify when platform setting is on (saves ZAR 3 in SA; if transfer fails, provider uploads bank confirmation letter).
    const { data: platformRow } = await (supabase as any)
      .from("platform_settings")
      .select("settings")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const skipVerify = (platformRow?.settings as any)?.paystack?.skip_payout_account_verification === true;

    // Resolve display name: skip verify (superadmin setting), use pre-verified name, or call Paystack verify
    let resolvedName: string;
    if (skipVerify) {
      resolvedName = account_name.trim();
    } else if (verified_account_name?.trim()) {
      resolvedName = verified_account_name.trim();
    } else {
      const verifyResult = await verifyAccount({ account_number, bank_code });
      if (!verifyResult.status || !verifyResult.data?.account_name) {
        return errorResponse(
          verifyResult.message || "Invalid bank account. Please check the account number and bank.",
          "ACCOUNT_VERIFICATION_FAILED",
          400
        );
      }
      resolvedName = verifyResult.data.account_name;
    }

    // Create transfer recipient in Paystack (use resolved name for exact match)
    const paystackRecipient = await createTransferRecipient({
      type: type as "nuban",
      name: resolvedName,
      account_number,
      bank_code,
      currency: currency || "ZAR",
      description: description || `Payout account for ${resolvedName}`,
      email: email || undefined,
      metadata: {
        provider_id: providerId,
        added_by: user.id,
      },
    });

    if (!paystackRecipient.data) {
      return errorResponse(
        paystackRecipient.message || "Failed to create transfer recipient",
        "PAYSTACK_ERROR",
        500
      );
    }

    // Extract account details from Paystack response (align with DB schema)
    const details = (paystackRecipient.data as any)?.details;
    const accountNumberLast4 = account_number.slice(-4);

    // Store in database - all columns must match provider_payout_accounts schema
    const { data: savedAccount, error: saveError } = await supabase
      .from("provider_payout_accounts")
      .insert({
        provider_id: providerId,
        recipient_code: paystackRecipient.data.recipient_code,
        recipient_id: paystackRecipient.data.id ?? null,
        type: paystackRecipient.data.type || "nuban",
        account_number_last4: accountNumberLast4,
        account_name: details?.account_name || resolvedName || account_name,
        bank_code: details?.bank_code || bank_code,
        bank_name: details?.bank_name ?? null,
        currency: paystackRecipient.data.currency || currency,
        active: paystackRecipient.data.active !== false,
        metadata: {
          paystack_response: paystackRecipient.data,
          added_by: user.id,
          country: country ?? undefined,
        },
      })
      .select()
      .single();

    if (saveError) {
      // If save fails, try to delete the Paystack recipient
      try {
        await deleteTransferRecipient(paystackRecipient.data.recipient_code);
      } catch (deleteError) {
        console.error("Failed to cleanup Paystack recipient:", deleteError);
      }
      throw saveError;
    }

    return successResponse(savedAccount);
  } catch (error) {
    return handleApiError(error, "Failed to add payout account");
  }
}
