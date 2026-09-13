"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@beautonomi/i18n";

export function SetPasswordOffer({
  open,
  onSkip,
}: {
  open: boolean;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  if (open === false) return null;
  return (
    <div
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
      data-testid="set-password-offer"
      role="status"
    >
      <p className="text-sm font-semibold text-gray-900 mb-1">{t("auth.setPasswordTitle")}</p>
      <p className="text-xs text-gray-600 mb-3">
        {t("auth.setPasswordBody")}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button asChild className="h-10">
          <Link href="/account-settings/login-and-security">{t("auth.setPasswordCta")}</Link>
        </Button>
        <Button type="button" variant="outline" className="h-10" onClick={onSkip}>
          {t("auth.setPasswordLater")}
        </Button>
      </div>
    </div>
  );
}
