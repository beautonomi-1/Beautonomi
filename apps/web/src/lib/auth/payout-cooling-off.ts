import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CoolingOffSettings = {
  new_account_cooling_off_hours: number;
  cooling_off_first_account: boolean;
  cooling_off_admin_added: boolean;
};

const DEFAULTS: CoolingOffSettings = {
  new_account_cooling_off_hours: 48,
  cooling_off_first_account: false,
  cooling_off_admin_added: true,
};

export async function getPayoutCoolingOffSettings(): Promise<CoolingOffSettings> {
  const { data: row } = await getSupabaseAdmin()
    .from("platform_settings")
    .select("settings")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const payouts = ((row as { settings?: { payouts?: Record<string, unknown> } } | null)?.settings
    ?.payouts ?? {}) as Record<string, unknown>;
  return {
    new_account_cooling_off_hours:
      typeof payouts.new_account_cooling_off_hours === "number"
        ? payouts.new_account_cooling_off_hours
        : DEFAULTS.new_account_cooling_off_hours,
    cooling_off_first_account: payouts.cooling_off_first_account === true,
    cooling_off_admin_added: payouts.cooling_off_admin_added !== false,
  };
}

export function computeCoolingOffUntil(hours: number): string | null {
  if (!hours || hours <= 0) return null;
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

export function isAccountInCoolingOff(coolingOffUntil: string | null | undefined): boolean {
  if (!coolingOffUntil) return false;
  if (coolingOffUntil === "infinity") return true;
  return new Date(coolingOffUntil).getTime() > Date.now();
}

/** Includes soft-deleted rows so "delete everything, then add" can't qualify as a first account. */
export async function providerHasAnyPayoutAccount(providerId: string): Promise<boolean> {
  const { count } = await getSupabaseAdmin()
    .from("provider_payout_accounts")
    .select("id", { count: "exact", head: true })
    .eq("provider_id", providerId);
  return (count ?? 0) > 0;
}

/**
 * Alerts the business owner (and the staff member who made the change, if different)
 * that a payout account was added or changed. Never throws.
 */
export async function notifyPayoutAccountChange(input: {
  providerId: string;
  actorUserId: string;
  kind: "added" | "changed";
  accountId: string;
  accountLast4: string | null | undefined;
  bankName?: string | null;
  /** false when the actor is platform staff (they shouldn't get provider security alerts). */
  includeActor?: boolean;
}): Promise<void> {
  try {
    const { sendSecurityAlert } = await import("@/lib/notifications/security-notifications");
    const { data: prov } = await getSupabaseAdmin()
      .from("providers")
      .select("user_id")
      .eq("id", input.providerId)
      .maybeSingle();
    const ownerId = (prov as { user_id?: string | null } | null)?.user_id ?? null;
    const recipients = [
      ...new Set(
        [ownerId, input.includeActor === false ? null : input.actorUserId].filter((v): v is string =>
          Boolean(v),
        ),
      ),
    ];
    const key = input.kind === "added" ? "security_payout_account_added" : "security_payout_account_changed";
    await Promise.all(
      recipients.map((userId) =>
        sendSecurityAlert({
          key,
          userId,
          eventId: `${key}:${input.accountId}:${userId}:${Math.floor(Date.now() / 60_000)}`,
          variables: {
            account_last4: input.accountLast4 || "****",
            bank_name: input.bankName || "your bank",
          },
        }),
      ),
    );
  } catch (err) {
    console.warn("[payout-cooling-off] payout change alert failed", err);
  }
}
