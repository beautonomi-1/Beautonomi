/**
 * Advisory payout account name match against verified identity / business name.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computePayoutNameMatch } from "@/lib/identity-verification/identity-verification-service";

export async function applyPayoutNameMatchForAccount(
  providerId: string,
  payoutAccountId: string,
  accountName: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: provider } = await supabase
    .from("providers")
    .select(
      "payee_kind, registered_business_name, user_id",
    )
    .eq("id", providerId)
    .maybeSingle();

  if (!provider) return;

  const ownerUserId = (provider as { user_id: string }).user_id;
  const payeeKind =
    (provider as { payee_kind?: string }).payee_kind === "business"
      ? "business"
      : "individual";

  const { data: legalRow } = await supabase
    .from("users")
    .select("legal_first_name, legal_last_name")
    .eq("id", ownerUserId)
    .maybeSingle();

  const first = (legalRow as { legal_first_name?: string | null } | null)?.legal_first_name ?? "";
  const last = (legalRow as { legal_last_name?: string | null } | null)?.legal_last_name ?? "";
  const verifiedLegalName = [first, last].filter(Boolean).join(" ").trim() || null;

  const matchStatus = computePayoutNameMatch({
    accountName,
    payeeKind,
    verifiedLegalName,
    registeredBusinessName:
      (provider as { registered_business_name?: string | null }).registered_business_name ?? null,
  });

  const notes =
    matchStatus === "match_ok" || matchStatus === "business_name_match"
      ? "Automatic name match check passed."
      : matchStatus === "owner_fallback_match"
        ? "Payout name matches verified owner (not registered business name)."
        : matchStatus === "mismatch"
          ? "Payout account name does not match verified identity or declared business name."
          : "Insufficient data for automatic name match.";

  await supabase
    .from("provider_payout_accounts")
    .update({
      name_match_status: matchStatus,
      name_match_checked_at: new Date().toISOString(),
      name_match_notes: notes,
    })
    .eq("id", payoutAccountId);
}
