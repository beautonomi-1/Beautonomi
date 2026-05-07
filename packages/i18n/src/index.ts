import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import en from "./locales/en.json";
import zu from "./locales/zu.json";
import af from "./locales/af.json";
import st from "./locales/st.json";
import xh from "./locales/xh.json";
import nso from "./locales/nso.json";
import tn from "./locales/tn.json";
import ts from "./locales/ts.json";
import ve from "./locales/ve.json";
import ss from "./locales/ss.json";

export const defaultNS = "translation";

/** Bundled locales; `xh`–`ss` currently ship English copy — translate in-place (fallbackLng fills any gaps). */
export const resources = {
  en: { translation: en },
  zu: { translation: zu },
  af: { translation: af },
  st: { translation: st },
  xh: { translation: xh },
  nso: { translation: nso },
  tn: { translation: tn },
  ts: { translation: ts },
  ve: { translation: ve },
  ss: { translation: ss },
} as const;

export const supportedLanguages = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "zu", name: "Zulu", nativeName: "isiZulu" },
  { code: "xh", name: "Xhosa", nativeName: "isiXhosa" },
  { code: "af", name: "Afrikaans", nativeName: "Afrikaans" },
  { code: "st", name: "Southern Sotho", nativeName: "Sesotho" },
  { code: "nso", name: "Northern Sotho (Sepedi)", nativeName: "Sesotho sa Leboa" },
  { code: "tn", name: "Tswana", nativeName: "Setswana" },
  { code: "ts", name: "Tsonga", nativeName: "Xitsonga" },
  { code: "ve", name: "Venda", nativeName: "Tshivenda" },
  { code: "ss", name: "Swati", nativeName: "siSwati" },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]["code"];

/**
 * Merges CMS `preference_options` language rows with every locale that ships in `@beautonomi/i18n`.
 * When the API only lists English (or a subset), bundled languages (e.g. Afrikaans, Zulu) still appear.
 * API order is preserved for rows that exist; missing bundled codes are appended in `supportedLanguages` order.
 */
export function mergeLanguagePickerOptions(apiRows: { code: string; name: string }[]): { code: string; name: string }[] {
  const allowed = new Set(supportedLanguages.map((l) => l.code)) as Set<string>;
  const seen = new Set<string>();
  const out: { code: string; name: string }[] = [];

  for (const row of apiRows) {
    const raw = row.code?.trim();
    if (!raw) continue;
    const code = raw.split(/[-_]/)[0].toLowerCase();
    if (!allowed.has(code) || seen.has(code)) continue;
    seen.add(code);
    const meta = supportedLanguages.find((l) => l.code === code);
    const label = meta ? `${meta.nativeName} (${meta.name})` : (row.name?.trim() || code);
    out.push({ code, name: label });
  }

  for (const { code, nativeName, name } of supportedLanguages) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: `${nativeName} (${name})` });
  }

  return out;
}

/** Values stored in users.signup_source. Must match backend allowed list in apps/web profile PATCH. */
export const SIGNUP_SOURCE_OPTIONS = [
  { value: "google", labelKey: "auth.signupSourceGoogle" },
  { value: "social_instagram", labelKey: "auth.signupSourceInstagram" },
  { value: "social_facebook", labelKey: "auth.signupSourceFacebook" },
  { value: "social_twitter", labelKey: "auth.signupSourceTwitter" },
  { value: "friend_or_family", labelKey: "auth.signupSourceFriend" },
  { value: "blog_or_article", labelKey: "auth.signupSourceBlog" },
  { value: "app_store", labelKey: "auth.signupSourceAppStore" },
  { value: "provider_referral", labelKey: "auth.signupSourceProviderReferral" },
  { value: "other", labelKey: "auth.signupSourceOther" },
] as const;
export type SignupSourceValue = (typeof SIGNUP_SOURCE_OPTIONS)[number]["value"];

let initialized = false;

export function initI18n(lng: string = "en") {
  if (initialized) {
    i18n.changeLanguage(lng);
    return i18n;
  }

  i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: "en",
    defaultNS,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
      bindI18n: "languageChanged loaded",
      bindI18nStore: "added",
    },
  });

  initialized = true;
  return i18n;
}

export { i18n, useTranslation };
export type { TFunction } from "i18next";
