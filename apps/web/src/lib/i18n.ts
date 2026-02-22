import { initI18n } from "@beautonomi/i18n";

const detectLanguage = (): string => {
  if (typeof window === "undefined") return "en";
  return (
    localStorage.getItem("beautonomi_locale") ||
    navigator.language.split("-")[0] ||
    "en"
  );
};

initI18n(detectLanguage());
