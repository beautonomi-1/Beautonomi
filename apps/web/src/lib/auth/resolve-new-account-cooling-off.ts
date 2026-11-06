import {
  computeCoolingOffUntil,
  getPayoutCoolingOffSettings,
} from "@/lib/auth/payout-cooling-off";

export async function resolveCoolingOffUntilForNewAccount(isFirstAccount: boolean): Promise<string | null> {
  const settings = await getPayoutCoolingOffSettings();
  if (!settings.new_account_cooling_off_hours || settings.new_account_cooling_off_hours <= 0) {
    return null;
  }
  if (isFirstAccount && !settings.cooling_off_first_account) {
    return null;
  }
  return computeCoolingOffUntil(settings.new_account_cooling_off_hours);
}

/** Accounts added by staff on a provider's behalf are held (even the first) unless disabled in settings. */
export async function resolveCoolingOffUntilForAdminAddedAccount(): Promise<string | null> {
  const settings = await getPayoutCoolingOffSettings();
  if (!settings.cooling_off_admin_added) return null;
  return computeCoolingOffUntil(settings.new_account_cooling_off_hours);
}
