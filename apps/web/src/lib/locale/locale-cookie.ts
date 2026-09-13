import { LANGUAGE_COOKIE, normalizeLanguageCode } from "@beautonomi/i18n/language-registry";

export { LANGUAGE_COOKIE };

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function parseLanguageCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const trimmed = cookieHeader.trim();
  // `cookies().get(name)?.value` is a bare language code, not a Cookie header.
  if (!trimmed.includes("=") && !trimmed.includes(";")) {
    return normalizeLanguageCode(trimmed);
  }
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey?.trim() === LANGUAGE_COOKIE) {
      const value = decodeURIComponent(rest.join("=") || "").trim();
      return value ? normalizeLanguageCode(value) : null;
    }
  }
  return null;
}

export function languageCookieHeader(language: string): string {
  const code = normalizeLanguageCode(language);
  return `${LANGUAGE_COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
