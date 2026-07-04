/**
 * Verification Policy Resolver
 *
 * Single source of truth for whether Didit and/or manual verification are
 * available, and whether they are required for providers to go live or request
 * payouts.  All verification API routes and the config bundle go through this
 * helper so toggling a feature flag immediately affects the whole system.
 *
 * Effective Didit availability = flag(verification.didit.enabled) AND
 * env vars present (DIDIT_API_KEY + DIDIT_WORKFLOW_ID + DIDIT_WEBHOOK_SECRET).
 *
 * Effective manual availability = flag(verification.manual.enabled).
 *
 * Defaults are intentionally permissive (manual enabled, nothing required) so
 * existing deployments without the flags in the DB behave identically to
 * before this migration.
 *
 * @legacy Sumsub support is removed; sumsubEnabled is kept as false for any
 * callers that haven't been updated yet.  The "sumsub" VerificationMode value
 * is replaced by "didit".
 */

import { checkMultipleFeaturesServer } from "@/lib/server/feature-flags";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";
import { diditEnvPresent } from "@/lib/identity-verification/provider/didit-provider";

export type VerificationMode = "off" | "manual" | "didit" | "both";

export interface VerificationPolicy {
  /** Didit flag is on AND env vars are present. */
  diditEnabled: boolean;
  /**
   * @deprecated Sumsub is removed. Always false after migration.
   * Kept to avoid breaking callers that reference sumsubEnabled.
   */
  sumsubEnabled: boolean;
  /** Manual upload flag is on. */
  manualEnabled: boolean;
  /** Derived mode from the two booleans. */
  mode: VerificationMode;
  /** provider_verification flag: identity verification is required for providers to complete setup/go-live. */
  requiredForProviders: boolean;
  /** verification.didit.required_for_payouts flag: identity verification must be approved before a payout can be requested. */
  requiredForPayouts: boolean;
  /** verification.required_for_customers flag: identity verification is required before a customer's first booking. */
  requiredForCustomers: boolean;
  /** verification.didit.cross_validate: pass expected_details to Didit for name/DOB cross-validation. */
  crossValidate: boolean;
  /** verification.min_age: minimum age for eligibility. */
  minAge: number;
  /** verification.dedupe: detect duplicate identities across accounts. */
  dedupeEnabled: boolean;
}

function deriveMode(didit: boolean, manual: boolean): VerificationMode {
  if (didit && manual) return "both";
  if (didit) return "didit";
  if (manual) return "manual";
  return "off";
}

/**
 * Resolve the verification policy for a given tenant and environment.
 *
 * Always falls back to permissive defaults on any error so a misconfigured
 * flag DB row does not accidentally lock users out of verification.
 */
export async function resolveVerificationPolicy(
  tenantId: string | null | undefined,
  _environment = "production",
): Promise<VerificationPolicy> {
  try {
    const flags = await checkMultipleFeaturesServer(
      [
        FEATURE_FLAG_KEYS.VERIFICATION_DIDIT,
        FEATURE_FLAG_KEYS.VERIFICATION_MANUAL,
        FEATURE_FLAG_KEYS.VERIFICATION_REQUIRED_FOR_PROVIDERS,
        FEATURE_FLAG_KEYS.VERIFICATION_REQUIRED_FOR_PAYOUTS,
        FEATURE_FLAG_KEYS.VERIFICATION_REQUIRED_FOR_CUSTOMERS,
        FEATURE_FLAG_KEYS.VERIFICATION_DIDIT_CROSS_VALIDATE,
        FEATURE_FLAG_KEYS.VERIFICATION_MIN_AGE,
        FEATURE_FLAG_KEYS.VERIFICATION_DEDUPE,
      ],
      tenantId,
    );

    // Didit availability = flag on AND env vars present
    const diditFlagOn = flags[FEATURE_FLAG_KEYS.VERIFICATION_DIDIT] === true;
    const diditEnabled = diditFlagOn && diditEnvPresent();

    // Manual defaults to true if the flag row doesn't exist yet (preserves current behaviour).
    const manualEnabled = flags[FEATURE_FLAG_KEYS.VERIFICATION_MANUAL] !== false
      ? (flags[FEATURE_FLAG_KEYS.VERIFICATION_MANUAL] ?? true)
      : false;

    const requiredForProviders = flags[FEATURE_FLAG_KEYS.VERIFICATION_REQUIRED_FOR_PROVIDERS] === true;
    const requiredForPayouts   = flags[FEATURE_FLAG_KEYS.VERIFICATION_REQUIRED_FOR_PAYOUTS]   === true;
    const requiredForCustomers = flags[FEATURE_FLAG_KEYS.VERIFICATION_REQUIRED_FOR_CUSTOMERS] === true;
    const crossValidate        = flags[FEATURE_FLAG_KEYS.VERIFICATION_DIDIT_CROSS_VALIDATE] !== false
      ? (flags[FEATURE_FLAG_KEYS.VERIFICATION_DIDIT_CROSS_VALIDATE] ?? true)
      : false;

    // min_age is stored in metadata; default 18
    const minAgeRaw = flags[FEATURE_FLAG_KEYS.VERIFICATION_MIN_AGE];
    const minAge = typeof minAgeRaw === "number" ? minAgeRaw : 18;

    const dedupeEnabled = flags[FEATURE_FLAG_KEYS.VERIFICATION_DEDUPE] !== false
      ? (flags[FEATURE_FLAG_KEYS.VERIFICATION_DEDUPE] ?? true)
      : false;

    return {
      diditEnabled,
      sumsubEnabled: false,
      manualEnabled,
      mode: deriveMode(diditEnabled, manualEnabled),
      requiredForProviders,
      requiredForPayouts,
      requiredForCustomers,
      crossValidate,
      minAge,
      dedupeEnabled,
    };
  } catch (err) {
    console.warn("[resolveVerificationPolicy] error, using permissive defaults:", err);
    return {
      diditEnabled: false,
      sumsubEnabled: false,
      manualEnabled: true,
      mode: "manual",
      requiredForProviders: false,
      requiredForPayouts: false,
      requiredForCustomers: false,
      crossValidate: true,
      minAge: 18,
      dedupeEnabled: true,
    };
  }
}

/**
 * Returns true if the customer's identity verification is approved via any
 * path: Sumsub webhook or manual admin review (users.identity_verified /
 * users.identity_verification_status).
 */
export async function isCustomerVerificationApproved(
  userId: string,
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("users")
      .select("identity_verified, identity_verification_status")
      .eq("id", userId)
      .maybeSingle();
    return (
      (data as { identity_verified?: boolean | null } | null)?.identity_verified === true ||
      (data as { identity_verification_status?: string | null } | null)?.identity_verification_status === "approved"
    );
  } catch (err) {
    console.warn("[isCustomerVerificationApproved] error, defaulting to false:", err);
    return false;
  }
}

/**
 * Returns true if the provider's identity verification is in an approved state
 * via any path: Sumsub webhook, manual admin review, or direct admin toggle.
 */
export async function isProviderVerificationApproved(
  providerId: string,
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();

    const [{ data: kycRow }, { data: providerRow }] = await Promise.all([
      supabase
        .from("provider_verification_status")
        .select("status")
        .eq("provider_id", providerId)
        .maybeSingle(),
      supabase
        .from("providers")
        .select("is_verified, user_id")
        .eq("id", providerId)
        .maybeSingle(),
    ]);

    if ((providerRow as { is_verified?: boolean | null } | null)?.is_verified === true) {
      return true;
    }
    if ((kycRow as { status?: string | null } | null)?.status === "approved") {
      return true;
    }

    const ownerUserId = (providerRow as { user_id?: string | null } | null)?.user_id;
    if (ownerUserId) {
      const { data: userRow } = await supabase
        .from("users")
        .select("identity_verified, identity_verification_status")
        .eq("id", ownerUserId)
        .maybeSingle();
      if (
        (userRow as { identity_verified?: boolean | null } | null)?.identity_verified === true ||
        (userRow as { identity_verification_status?: string | null } | null)
          ?.identity_verification_status === "approved"
      ) {
        return true;
      }
    }

    return false;
  } catch (err) {
    console.warn("[isProviderVerificationApproved] error, defaulting to false:", err);
    return false;
  }
}
