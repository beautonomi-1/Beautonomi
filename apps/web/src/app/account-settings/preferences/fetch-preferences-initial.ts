import "server-only";

import { createNextRequestFromHeaders } from "@/lib/server/create-next-request";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { GET as getPreferenceOptions } from "@/app/api/public/preference-options/route";
import { GET as getProfile } from "@/app/api/me/profile/route";
import type { PreferenceOption, PreferencesPageInitial } from "./preferences-initial-types";
import { buildPreferencesPageInitial } from "./resolve-preferences-display";
import { expandLanguagePreferenceOptions } from "./expand-language-options";

export async function fetchPreferencesInitial(): Promise<PreferencesPageInitial | null> {
  const tenantReq = await createNextRequestFromHeaders("/api/me/profile");
  const tenantId = await resolveTenantIdWithZaFallback(tenantReq);
  const tenantRegion = tenantId ? await getTenantRegionConfig(tenantId) : null;
  const tenantCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
  const tenantTimezone = tenantRegion?.defaultTimezone?.trim() || "Africa/Johannesburg";

  const [langReq, curReq, tzReq, profileReq] = await Promise.all([
    createNextRequestFromHeaders("/api/public/preference-options?type=language"),
    createNextRequestFromHeaders("/api/public/preference-options?type=currency"),
    createNextRequestFromHeaders("/api/public/preference-options?type=timezone"),
    createNextRequestFromHeaders("/api/me/profile"),
  ]);

  const [langsRes, cursRes, tzsRes, profileRes] = await Promise.all([
    getPreferenceOptions(langReq),
    getPreferenceOptions(curReq),
    getPreferenceOptions(tzReq),
    getProfile(profileReq),
  ]);

  const parseOptions = async (res: Response): Promise<PreferenceOption[]> => {
    if (!res.ok) return [];
    const j = (await res.json().catch(() => ({}))) as { data?: PreferenceOption[] };
    return Array.isArray(j.data) ? j.data : [];
  };

  const [languagesRaw, currencies, timezones] = await Promise.all([
    parseOptions(langsRes),
    parseOptions(cursRes),
    parseOptions(tzsRes),
  ]);
  const languages = expandLanguagePreferenceOptions(languagesRaw);

  if (!profileRes.ok) return null;

  const profileJson = (await profileRes.json().catch(() => ({}))) as {
    data?: {
      preferred_language?: string | null;
      preferred_currency?: string | null;
      timezone?: string | null;
    };
  };
  const d = profileJson.data;
  const profileSlice = {
    preferred_language: d?.preferred_language ?? null,
    preferred_currency: d?.preferred_currency ?? null,
    timezone: d?.timezone ?? null,
  };

  const loadedOptions = { languages, currencies, timezones };
  return buildPreferencesPageInitial(loadedOptions, profileSlice, tenantCurrency, tenantTimezone);
}
