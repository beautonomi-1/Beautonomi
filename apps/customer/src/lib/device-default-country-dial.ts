import * as Localization from "expo-localization";
import { dialCodeForIso3166Alpha2 } from "@beautonomi/phone";

const FALLBACK_ISO = "ZA";

/** When IANA timezone clearly indicates country (fixes wrong Region in iOS Settings, e.g. TM + Africa/Johannesburg). */
const TIMEZONE_HINT_TO_ISO: Record<string, string> = {
  "Africa/Johannesburg": "ZA",
};

function getRegionIsoFromTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TIMEZONE_HINT_TO_ISO[tz]) return TIMEZONE_HINT_TO_ISO[tz];
  } catch {
    /* ignore */
  }
  return null;
}

/** ISO 3166-1 alpha-2 from device locale / timezone. Defaults to ZA. */
export function getDeviceRegionCountryIso(): string {
  const envIso = process.env.EXPO_PUBLIC_DEFAULT_PHONE_REGION?.trim().toUpperCase();
  if (envIso && /^[A-Z]{2}$/.test(envIso)) return envIso;

  try {
    const localeIso = Localization.getLocales?.()?.[0]?.regionCode?.toUpperCase();
    const tzIso = getRegionIsoFromTimeZone();
    // Timezone beats locale when it's in our known hint map (e.g. Africa/Johannesburg → ZA).
    // This means a user on an emulator/device with US locale but SA timezone still gets +27.
    if (tzIso) return tzIso;
    if (localeIso && /^[A-Z]{2}$/.test(localeIso)) return localeIso;
  } catch {
    /* ignore */
  }
  return FALLBACK_ISO;
}

/** Default calling code from device (e.g. ZA → +27). Override via EXPO_PUBLIC_DEFAULT_PHONE_DIAL / EXPO_PUBLIC_DEFAULT_PHONE_REGION. */
export function getDeviceDefaultCountryDial(): string {
  const envDial = process.env.EXPO_PUBLIC_DEFAULT_PHONE_DIAL?.trim();
  if (envDial && /^\+\d{1,4}$/.test(envDial)) return envDial;

  const dial = dialCodeForIso3166Alpha2(getDeviceRegionCountryIso());
  return dial || "+27";
}
