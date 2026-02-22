import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import en from "./locales/en.json";
import zu from "./locales/zu.json";
import af from "./locales/af.json";
import st from "./locales/st.json";

export const defaultNS = "translation";

export const resources = {
  en: { translation: en },
  zu: { translation: zu },
  af: { translation: af },
  st: { translation: st },
} as const;

export const supportedLanguages = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "zu", name: "Zulu", nativeName: "isiZulu" },
  { code: "af", name: "Afrikaans", nativeName: "Afrikaans" },
  { code: "st", name: "Sesotho", nativeName: "Sesotho" },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]["code"];

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
    },
  });

  initialized = true;
  return i18n;
}

export { i18n, useTranslation };
export type { TFunction } from "i18next";
