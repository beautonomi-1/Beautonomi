import { LANGUAGE_STORAGE_KEY, normalizeLanguageCode } from "@beautonomi/i18n/language-registry";
import { languageCookieHeader } from "@/lib/locale/locale-cookie";

/** Persist UI language in localStorage + bt_lang cookie (single storage contract). */
export function persistClientLanguage(language: string): string {
  const code = normalizeLanguageCode(language);
  if (typeof window === "undefined") return code;
  localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  document.cookie = languageCookieHeader(code);
  window.dispatchEvent(
    new CustomEvent("beautonomi:preferred-language-changed", { detail: { language: code } }),
  );
  return code;
}
