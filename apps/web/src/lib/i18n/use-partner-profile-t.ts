import { useCallback } from "react";
import { useTranslation } from "@beautonomi/i18n";

export function usePartnerProfileT() {
  const { t } = useTranslation();
  const pp = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.partnerProfile.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  return { t, pp };
}
