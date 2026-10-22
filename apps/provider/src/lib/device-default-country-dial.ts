import * as Localization from "expo-localization";
import { AppState } from "react-native";
import { dialCodeForIso3166Alpha2 } from "@beautonomi/phone";

const FALLBACK_ISO = "ZA";

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

let cachedLocaleCountryIso: string | null = null;
let appStateListenerAttached = false;

function computeLocaleCountryIso(): string {
  try {
    const localeIso = Localization.getLocales?.()?.[0]?.regionCode?.toUpperCase();
    const tzIso = getRegionIsoFromTimeZone();
    if (tzIso) return tzIso;
    if (localeIso && /^[A-Z]{2}$/.test(localeIso)) return localeIso;
  } catch {
    /* ignore */
  }
  return FALLBACK_ISO;
}

function resolveLocaleCountryIso(): string {
  if (!appStateListenerAttached) {
    appStateListenerAttached = true;
    AppState.addEventListener("change", (state) => {
      if (state === "active") cachedLocaleCountryIso = null;
    });
  }
  if (cachedLocaleCountryIso == null) cachedLocaleCountryIso = computeLocaleCountryIso();
  return cachedLocaleCountryIso;
}

export function getDeviceLocaleCountryIso(): string {
  return resolveLocaleCountryIso();
}

export function getDevicePhoneRegionIso(): string {
  const envIso = process.env.EXPO_PUBLIC_DEFAULT_PHONE_REGION?.trim().toUpperCase();
  if (envIso && /^[A-Z]{2}$/.test(envIso)) return envIso;
  return resolveLocaleCountryIso();
}

export function getDeviceRegionCountryIso(): string {
  return getDeviceLocaleCountryIso();
}

export function getDeviceDefaultCountryDial(): string {
  const envDial = process.env.EXPO_PUBLIC_DEFAULT_PHONE_DIAL?.trim();
  if (envDial && /^\+\d{1,4}$/.test(envDial)) return envDial;

  const dial = dialCodeForIso3166Alpha2(getDevicePhoneRegionIso());
  return dial || "+27";
}
