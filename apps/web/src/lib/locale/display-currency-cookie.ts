import { normalizeCurrencyCode } from "@beautonomi/utils";

export const DISPLAY_CURRENCY_COOKIE = "bt_display_currency";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function parseDisplayCurrencyCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const trimmed = cookieHeader.trim();
  // `cookies().get(name)?.value` is a bare ISO code, not a Cookie header.
  if (!trimmed.includes("=") && !trimmed.includes(";")) {
    return normalizeCurrencyCode(trimmed);
  }
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey?.trim() === DISPLAY_CURRENCY_COOKIE) {
      const value = decodeURIComponent(rest.join("=") || "").trim();
      return value ? normalizeCurrencyCode(value) : null;
    }
  }
  return null;
}

export function displayCurrencyCookieHeader(currency: string): string {
  const code = normalizeCurrencyCode(currency);
  return `${DISPLAY_CURRENCY_COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

export const DISPLAY_CURRENCY_STORAGE_KEY = "beautonomi:display_currency";
