"use client";

import { dialCodeForIso3166Alpha2 } from "@beautonomi/phone/dial-code-for-iso";
import { DEFAULT_PHONE_COUNTRY_CODE } from "@/lib/phone";

export const DEFAULT_PHONE_DIAL_CACHE_KEY = "beautonomi_default_phone_dial_v1";

/** Dial including +, e.g. +27 */
export function getCachedDefaultPhoneDial(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const d = sessionStorage.getItem(DEFAULT_PHONE_DIAL_CACHE_KEY);
    if (d?.startsWith("+")) return d;
  } catch {
    /* ignore */
  }
  return null;
}

export function setCachedDefaultPhoneDial(dial: string): void {
  if (typeof window === "undefined" || !dial.startsWith("+")) return;
  try {
    sessionStorage.setItem(DEFAULT_PHONE_DIAL_CACHE_KEY, dial);
  } catch {
    /* ignore */
  }
}

/** Region subtag from BCP 47 (e.g. en-ZA → ZA). */
export function inferIsoFromNavigatorLocale(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  const tags = [...(navigator.languages || []), navigator.language].filter(Boolean);
  for (const tag of tags) {
    const parts = tag.split(/[-_]/);
    if (parts.length >= 2) {
      const region = parts[parts.length - 1].toUpperCase();
      if (/^[A-Z]{2}$/.test(region) && region !== "419") return region;
    }
  }
  return undefined;
}

/** Map common IANA zones → ISO (fallback when geo headers missing). */
export function inferIsoFromTimeZone(): string | undefined {
  if (typeof Intl === "undefined") return undefined;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const rules: { re: RegExp; iso: string }[] = [
      { re: /Johannesburg|Harare|Windhoek|Maputo|Gaborone|Lusaka|Maseru|Mbabane/, iso: "ZA" },
      { re: /Nairobi|Kampala|Dar_es_Salaam|Kigali/, iso: "KE" },
      { re: /Lagos|Abuja/, iso: "NG" },
      { re: /Cairo/, iso: "EG" },
      { re: /London/, iso: "GB" },
      { re: /Dublin/, iso: "IE" },
      { re: /Lisbon/, iso: "PT" },
      { re: /Paris|Monaco/, iso: "FR" },
      { re: /Berlin|Hamburg|Munich|Frankfurt/, iso: "DE" },
      { re: /Vienna/, iso: "AT" },
      { re: /Zurich|Geneva/, iso: "CH" },
      { re: /Amsterdam/, iso: "NL" },
      { re: /Madrid|Barcelona/, iso: "ES" },
      { re: /Rome|Milan/, iso: "IT" },
      { re: /Brussels/, iso: "BE" },
      { re: /New_York|Chicago|Denver|Los_Angeles|Phoenix|Detroit|Seattle|Boston|Miami|Houston|Atlanta/, iso: "US" },
      { re: /Toronto|Vancouver|Montreal|Winnipeg|Edmonton|Halifax/, iso: "CA" },
      { re: /Sydney|Melbourne|Perth|Brisbane|Adelaide/, iso: "AU" },
      { re: /Auckland|Wellington/, iso: "NZ" },
      { re: /Dubai/, iso: "AE" },
      { re: /Singapore/, iso: "SG" },
      { re: /Tokyo/, iso: "JP" },
      { re: /Seoul/, iso: "KR" },
      { re: /Kolkata|Mumbai|Chennai|Delhi/, iso: "IN" },
    ];
    for (const { re, iso } of rules) {
      if (re.test(tz)) return iso;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function resolveDialFromIso(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  return dialCodeForIso3166Alpha2(iso);
}

/** Digits only (no +) for normalizePhoneToE164(..., countryDigits). */
export function defaultPhoneCountryDigitsForNormalize(): string {
  const cached = getCachedDefaultPhoneDial();
  if (cached) return cached.replace(/^\+/, "");
  return DEFAULT_PHONE_COUNTRY_CODE;
}
