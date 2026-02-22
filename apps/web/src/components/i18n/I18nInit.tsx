"use client";

import { useEffect } from "react";
import { initI18n } from "@beautonomi/i18n";

function detectLanguage(): string {
  if (typeof window === "undefined") return "en";
  return (
    localStorage.getItem("beautonomi_locale") ||
    navigator.language.split("-")[0] ||
    "en"
  );
}

export default function I18nInit() {
  useEffect(() => {
    initI18n(detectLanguage());
  }, []);
  return null;
}
