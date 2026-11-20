import { useTranslation } from "@beautonomi/i18n";

/** BCP 47 language tag for formatting dates in the app language (not device locale). */
export function useAppDateLocale(): string {
  const { i18n } = useTranslation();
  return i18n.language || "en";
}