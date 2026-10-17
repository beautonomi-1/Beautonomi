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
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { encryptSensitiveField } from "@/lib/security/field-encryption";
import { resolvePayoutRailForTenant } from "@/lib/payments/payout-rail";
import { serializeCustomerBankAccount } from "@/lib/wallet-bank-refunds/serialize";
import {
  checkBankVerifyRateLimit,
  compareAccountHolderName,
  verifyCustomerBankAccount,
} from "@/lib/wallet-bank-refunds/verify-bank-account";

const PAYSTACK_RECIPIENT_TYPES = ["nuban", "basa", "ghipss", "mobile_money"] as const;
const MAX_ACTIVE_ACCOUNTS = 3;

const createSchema = z.object({
  account_number: z.string().min(8).max(20),
  bank_code: z.string().min(1),
  bank_name: z.string().optional(),
  account_name: z.string().min(1),
  country: z.string().optional(),
  currency: z.string().optional(),
  recipient_type: z.enum(PAYSTACK_RECIPIENT_TYPES).optional(),
});

function resolveRecipientType(country: string | undefined, requested?: string): string {
  const iso = (country || "ZA").trim().toUpperCase();
  if (iso === "ZA") return "basa";
  if (iso === "GH") return requested === "mobile_money" ? "mobile_money" : "ghipss";
  return requested || "nuban";
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("customer_bank_accounts")
      .select("*")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return successResponse((data || []).map((row) => serializeCustomerBankAccount(row as never)));
  } catch (error) {
    return handleApiError(error, "Failed to list bank accounts");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["customer", "provider_owner", "provider_staff", "superadmin"], request);
    const limit = await checkBankVerifyRateLimit(request, user.id);
    if (limit.allowed === false) {
      return errorResponse("Too many attempts. Try again later.", "RATE_LIMITED", 429);
    }
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation failed", "VALIDATION_ERROR", 400);
    }

    const { account_number, bank_code, bank_name, account_name, country, currency, recipient_type } =
      parsed.data;
    const admin = getSupabaseAdmin();

    const { data: existing } = await admin
      .from("customer_bank_accounts")
      .select("id")
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if ((existing?.length ?? 0) >= MAX_ACTIVE_ACCOUNTS) {
      return errorResponse(
        `You can save up to ${MAX_ACTIVE_ACCOUNTS} bank accounts. Remove one to add another.`,
        "TOO_MANY_ACCOUNTS",
        400,
      );
    }

    const cleanNumber = account_number.replace(/\s/g, "");
    const resolvedCurrency = currency?.trim() || tenantRegion?.defaultCurrency || LAST_RESORT_CURRENCY;
    const resolvedCountry = (country || tenantRegion?.regionCode || "ZA").trim().toUpperCase();
    const resolvedType = resolveRecipientType(resolvedCountry, recipient_type);

    let resolvedName = account_name.trim();
    let verified = false;
    let verificationSource: "paystack" | "flutterwave" | "manual" = "manual";
    try {
      const result = await verifyCustomerBankAccount({
        supabase: admin,
        tenantId,
        account_number: cleanNumber,
        bank_code,
      });
      resolvedName = result.account_name.trim();
      verified = true;
      verificationSource = result.source;
    } catch (verifyErr) {
      if (!(verifyErr instanceof Error && verifyErr.message === "VERIFICATION_DISABLED")) {
        const msg =
          verifyErr instanceof Error
            ? verifyErr.message
            : "Account could not be verified. Check the account number and bank.";
        return errorResponse(msg, "ACCOUNT_VERIFICATION_FAILED", 400);
      }
    }

    const { data: profile } = await admin
      .from("users")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const nameMatch = compareAccountHolderName(
      resolvedName,
      (profile as { full_name?: string | null } | null)?.full_name,
    );

    const { data: saved, error } = await admin
      .from("customer_bank_accounts")
      .insert({
        user_id: user.id,
        tenant_id: tenantId,
        account_number_encrypted: encryptSensitiveField(cleanNumber),
        account_number_last4: cleanNumber.slice(-4),
        account_name: resolvedName,
        bank_code,
        bank_name: bank_name?.trim() || null,
        country: resolvedCountry,
        currency: resolvedCurrency,
        recipient_type: resolvedType,
        payout_rail: (await resolvePayoutRailForTenant(tenantId)) ?? null,
        verified,
        verification_source: verificationSource,
        name_match: nameMatch,
        verified_at: verified ? new Date().toISOString() : null,
        is_primary: !existing?.length,
      })
      .select("*")
      .single();
    if (error) throw error;

    return successResponse(serializeCustomerBankAccount(saved as never));
  } catch (error) {
    return handleApiError(error, "Failed to add bank account");
  }
}
