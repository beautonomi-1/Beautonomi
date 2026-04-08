"use client";

import { useEffect } from "react";
import { initI18n } from "@beautonomi/i18n";
import { useCookieConsent } from "@/providers/CookieConsentProvider";

/**
 * Language preference may be stored in localStorage when functional cookies are allowed.
 */
export default function I18nInit() {
  const { isReady, allowsFunctional } = useCookieConsent();

  useEffect(() => {
    if (!isReady) return;
    const lang = allowsFunctional
      ? localStorage.getItem("beautonomi_locale") || navigator.language.split("-")[0] || "en"
      : navigator.language.split("-")[0] || "en";
    initI18n(lang);
  }, [isReady, allowsFunctional]);

  return null;
}
