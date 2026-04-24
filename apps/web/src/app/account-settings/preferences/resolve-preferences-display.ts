import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import type { PreferenceOption, Preferences, PreferencesPageInitial } from "./preferences-initial-types";

type ProfilePrefs = {
  preferred_language: string | null;
  preferred_currency: string | null;
  timezone: string | null;
};

export function buildPreferencesPageInitial(
  loadedOptions: PreferencesPageInitial["options"],
  data: ProfilePrefs | null | undefined,
  tenantCurrency: string,
  tenantTimezone: string,
): PreferencesPageInitial {
  const languageCode = data?.preferred_language || "en";
  const currencyCode = data?.preferred_currency || tenantCurrency;
  const timezoneCode = data?.timezone || tenantTimezone;

  const languageOption: Pick<PreferenceOption, "code" | "name"> =
    loadedOptions.languages.find((l) => l.code === languageCode) ||
    loadedOptions.languages.find((l) => l.code === "en") ||
    { code: "en", name: "English" };

  const currencyOption: Pick<PreferenceOption, "code" | "name"> =
    loadedOptions.currencies.find((c) => c.code === currencyCode) ||
    loadedOptions.currencies.find((c) => c.code === tenantCurrency) ||
    loadedOptions.currencies.find((c) => c.code === LAST_RESORT_CURRENCY) ||
    { code: tenantCurrency, name: tenantCurrency };

  const timezoneOption: Pick<PreferenceOption, "code" | "name"> =
    loadedOptions.timezones.find((t) => t.code === timezoneCode) ||
    loadedOptions.timezones.find((t) => t.code === tenantTimezone) ||
    loadedOptions.timezones.find((t) => t.code === "Africa/Johannesburg") ||
    { code: tenantTimezone, name: tenantTimezone };

  const preferences: Preferences = {
    language: { code: languageOption.code || "en", name: languageOption.name },
    currency: { code: currencyOption.code || tenantCurrency, name: currencyOption.name },
    timezone: { code: timezoneOption.code || tenantTimezone, name: timezoneOption.name },
  };

  return { options: loadedOptions, preferences };
}
