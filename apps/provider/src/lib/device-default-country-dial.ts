import * as Localization from "expo-localization";
import { dialCodeForIso3166Alpha2 } from "@beautonomi/phone";

const FALLBACK_ISO = "ZA";

/** ISO 3166-1 alpha-2 from device locale. Defaults to ZA. */
export function getDeviceRegionCountryIso(): string {
  try {
    const iso = Localization.getLocales?.()?.[0]?.regionCode?.toUpperCase();
    if (iso && /^[A-Z]{2}$/.test(iso)) return iso;
  } catch {
    /* ignore */
  }
  return FALLBACK_ISO;
}

/** Default calling code from device locale (e.g. ZA → +27). Falls back to +27. */
export function getDeviceDefaultCountryDial(): string {
  try {
    const iso = Localization.getLocales?.()?.[0]?.regionCode?.toUpperCase();
    if (iso && /^[A-Z]{2}$/.test(iso)) {
      const dial = dialCodeForIso3166Alpha2(iso);
      if (dial) return dial;
    }
  } catch {
    /* ignore */
  }
  const dial = dialCodeForIso3166Alpha2(FALLBACK_ISO);
  return dial || "+27";
}
