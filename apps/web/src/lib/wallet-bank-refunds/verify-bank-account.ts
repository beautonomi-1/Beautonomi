import { verifyAccount } from "@/lib/payments/paystack-complete";
import { resolveFlutterwaveBankAccount } from "@/lib/payments/flutterwave-banks";
import { resolvePayoutRailForTenant } from "@/lib/payments/payout-rail";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEffectiveSkipPayoutAccountVerification } from "@/lib/payments/payout-account-verification-settings";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit/store";

export type BankVerificationSource = "paystack" | "flutterwave";
export type BankNameMatch = "match" | "partial" | "mismatch" | "unknown";

export async function verifyCustomerBankAccount(input: {
  supabase: SupabaseClient;
  tenantId: string;
  account_number: string;
  bank_code: string;
}): Promise<{ account_name: string; account_number: string; source: BankVerificationSource }> {
  const { skip: skipVerify } = await getEffectiveSkipPayoutAccountVerification(input.supabase, input.tenantId);
  if (skipVerify) {
    throw new Error("VERIFICATION_DISABLED");
  }

  const rail = await resolvePayoutRailForTenant(input.tenantId);
  if (rail === "flutterwave") {
    const resolved = await resolveFlutterwaveBankAccount({
      accountNumber: input.account_number,
      accountBank: input.bank_code,
      tenantId: input.tenantId,
    });
    return {
      account_name: resolved.account_name,
      account_number: input.account_number,
      source: "flutterwave",
    };
  }

  const result = await verifyAccount(
    { account_number: input.account_number, bank_code: input.bank_code },
    { tenantId: input.tenantId },
  );
  if (!result.status || !result.data?.account_name) {
    throw new Error(result.message || "Account could not be verified");
  }
  return {
    account_name: result.data.account_name,
    account_number: result.data.account_number ?? input.account_number,
    source: "paystack",
  };
}

function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

/** Compares the bank-verified holder name with the Beautonomi profile name (finance review signal only). */
export function compareAccountHolderName(
  accountName: string | null | undefined,
  profileName: string | null | undefined,
): BankNameMatch {
  if (!accountName?.trim() || !profileName?.trim()) return "unknown";
  const a = nameTokens(accountName);
  const p = nameTokens(profileName);
  if (a.size === 0 || p.size === 0) return "unknown";
  let shared = 0;
  for (const t of p) if (a.has(t)) shared += 1;
  if (shared === 0) return "mismatch";
  return shared >= Math.min(2, p.size) ? "match" : "partial";
}

const VERIFY_USER_LIMIT = { prefix: "bank-verify:user", limit: 10, windowSeconds: 60 * 60 } as const;
const VERIFY_IP_LIMIT = { prefix: "bank-verify:ip", limit: 30, windowSeconds: 60 * 60 } as const;

export async function checkBankVerifyRateLimit(request: Request, userId: string) {
  const ipResult = await checkRateLimit(VERIFY_IP_LIMIT, getClientIp(request));
  if (ipResult.allowed === false) return ipResult;
  return checkRateLimit(VERIFY_USER_LIMIT, userId);
}
