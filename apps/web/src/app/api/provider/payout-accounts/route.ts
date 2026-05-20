import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resourceTenantMatchesHostTenant } from "@/lib/bookings/resolve-payment-tenant";
import { z } from "zod";
import { getEffectiveSkipPayoutAccountVerification } from "@/lib/payments/payout-account-verification-settings";

// §payout-account-fix 2026-05: Paystack `/transferrecipient` accepts `nuban`,
// `ghipss`, `mobile_money`, and `basa`. For South African providers (the
// primary market today), Paystack uses the `basa` type. We accept any of the
// documented values so the client can pick the correct one per country, and
// fall back to `nuban` when not specified.
const PAYSTACK_RECIPIENT_TYPES = ["nuban", "basa", "ghipss", "mobile_money"] as const;
type PaystackRecipientType = (typeof PAYSTACK_RECIPIENT_TYPES)[number];

const createAccountSchema = z.object({
  type: z.enum(PAYSTACK_RECIPIENT_TYPES).default("nuban"),
  account_number: z.string().min(8).max(20),
  bank_code: z.string().min(1),
  account_name: z.string().min(1),
  currency: z.string().min(1).optional(),
  country: z.string().optional(),
  /** If provided, server skips Paystack verify (saves cost: ZAR 3/call in South Africa). Use when client already called /verify. */
  verified_account_name: z.string().min(1).optional(),
  description: z.string().optional(),
  email: z.string().email().optional(),
});

/**
 * Recipient type heuristic for countries where Paystack expects something other than
 * `nuban` (the default). South Africa uses `basa`. Other countries fall back to the
 * client-provided type or `nuban` so behavior remains backward compatible.
 */
function resolveRecipientType(
  requested: PaystackRecipientType,
  country: string | undefined,
): PaystackRecipientType {
  const iso = (country || "").trim().toUpperCase();
  if (iso === "ZA") return "basa";
  if (iso === "GH") return requested === "mobile_money" ? "mobile_money" : "ghipss";
  return requested;
}

/**
 * GET /api/provider/payout-accounts
 *
 * List provider's payout accounts (bank accounts).
 *
 * §payout-account-fix 2026-05: read with the service-role admin client so the
 * RLS gap on `provider_payout_accounts` (only SELECT for providers, INSERT/UPDATE/DELETE
 * superadmin-only) never causes empty lists for legitimate provider users. The
 * route still enforces auth via `requireRoleInApi` + provider/tenant ownership.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const sessionSupabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const providerId = await getProviderIdForUser(user.id, sessionSupabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

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

    const { data: accounts, error } = await admin
      .from("provider_payout_accounts")
      .select("*")
      .eq("provider_id", providerId)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false })
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
 * Add a new bank account for payouts.
 * Creates a Paystack transfer recipient and stores it in `provider_payout_accounts`.
 *
 * §payout-account-fix 2026-05: previously failed with a generic "Failed to add
 * payout account" because the user-scoped Supabase client could not INSERT into
 * `provider_payout_accounts` (RLS only grants providers SELECT). Now we use the
 * admin client for the INSERT after enforcing auth + provider ownership + tenant
 * isolation. Error responses are also more specific so the UI can surface the
 * exact failure (validation, Paystack verify, Paystack recipient, or DB save).
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const sessionSupabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const providerId = await getProviderIdForUser(user.id, sessionSupabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

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
    const validationResult = createAccountSchema.safeParse(body);

    if (!validationResult.success) {
      return errorResponse(
        "Please check the bank account details and try again.",
        "VALIDATION_ERROR",
        400,
        validationResult.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }))
      );
    }

    const {
      account_number,
      bank_code,
      account_name,
      type,
      currency,
      country,
      verified_account_name,
      description,
      email,
    } = validationResult.data;

    const tenantRegion = await getTenantRegionConfig(tenantId);
    const fallbackCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
    const resolvedCurrency = currency?.trim() || fallbackCurrency;
    const resolvedType = resolveRecipientType(type, country);

    const { skip: skipVerify } = await getEffectiveSkipPayoutAccountVerification(admin, tenantId);

    // Resolve display name: skip verify (superadmin setting), use pre-verified name, or call Paystack verify.
    let resolvedName: string;
    if (skipVerify) {
      resolvedName = account_name.trim();
    } else if (verified_account_name?.trim()) {
      resolvedName = verified_account_name.trim();
    } else {
      try {
        const verifyResult = await verifyAccount(
          { account_number, bank_code },
          { tenantId }
        );
        if (!verifyResult.status || !verifyResult.data?.account_name) {
          return errorResponse(
            verifyResult.message ||
              "Paystack could not verify this account. Double-check the bank and account number.",
            "ACCOUNT_VERIFICATION_FAILED",
            400
          );
        }
        resolvedName = verifyResult.data.account_name;
      } catch (verifyError) {
        const message =
          verifyError instanceof Error
            ? verifyError.message
            : "Paystack account verification failed";
        return errorResponse(message, "ACCOUNT_VERIFICATION_FAILED", 400);
      }
    }

    // Create transfer recipient in Paystack (use resolved name for exact match).
    let paystackRecipient;
    try {
      paystackRecipient = await createTransferRecipient(
        {
          type: resolvedType as "nuban",
          name: resolvedName,
          account_number,
          bank_code,
          currency: resolvedCurrency,
          description: description || `Payout account for ${resolvedName}`,
          email: email || undefined,
          metadata: {
            provider_id: providerId,
            added_by: user.id,
          },
        },
        { tenantId }
      );
    } catch (paystackError) {
      const message =
        paystackError instanceof Error
          ? paystackError.message
          : "Paystack rejected the transfer recipient request.";
      return errorResponse(message, "PAYSTACK_ERROR", 400);
    }

    if (!paystackRecipient.data) {
      return errorResponse(
        paystackRecipient.message || "Failed to create Paystack transfer recipient.",
        "PAYSTACK_ERROR",
        502
      );
    }

    const details = (paystackRecipient.data as any)?.details;
    const accountNumberLast4 = account_number.slice(-4);

    // First active account for this provider becomes primary.
    const { data: existingAccounts } = await admin
      .from("provider_payout_accounts")
      .select("id")
      .eq("provider_id", providerId)
      .is("deleted_at", null);
    const isFirstAccount = !existingAccounts?.length;

    const { data: savedAccount, error: saveError } = await admin
      .from("provider_payout_accounts")
      .insert({
        provider_id: providerId,
        recipient_code: paystackRecipient.data.recipient_code,
        recipient_id: paystackRecipient.data.id ?? null,
        type: paystackRecipient.data.type || resolvedType,
        account_number_last4: accountNumberLast4,
        account_name: details?.account_name || resolvedName || account_name,
        bank_code: details?.bank_code || bank_code,
        bank_name: details?.bank_name ?? null,
        currency: paystackRecipient.data.currency || resolvedCurrency,
        active: paystackRecipient.data.active !== false,
        is_primary: isFirstAccount,
        metadata: {
          paystack_response: paystackRecipient.data,
          added_by: user.id,
          country: country ?? undefined,
        },
      })
      .select()
      .single();

    if (saveError) {
      // If we managed to create the Paystack recipient but failed to persist
      // it locally, roll the recipient back so we don't leak orphan recipients.
      try {
        await deleteTransferRecipient(paystackRecipient.data.recipient_code, { tenantId });
      } catch (deleteError) {
        console.error("Failed to cleanup orphaned Paystack recipient:", deleteError);
      }
      return errorResponse(
        "We saved your bank with Paystack but couldn't store it locally. Please try again or contact support.",
        "DB_SAVE_FAILED",
        500,
        process.env.NODE_ENV === "development" ? { details: saveError.message } : undefined,
      );
    }

    return successResponse(savedAccount);
  } catch (error) {
    return handleApiError(error, "Failed to add payout account");
  }
}
