"use client";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@beautonomi/i18n";

export function AccountLinkOffer({
  offer,
  onGoogle,
  onEmailCode,
  disabled,
}: {
  offer: "google" | "email" | "apple" | "phone" | null;
  onGoogle: () => void;
  onEmailCode: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  if (!offer) return null;
  return (
    <div className="mt-3 space-y-2" data-testid="account-link-offer">
      <p className="text-xs text-gray-600">{t("auth.alreadyRegistered")}</p>
      {offer === "google" ? (
        <Button
          type="button"
          variant="outline"
          className="w-full h-11"
          disabled={disabled}
          onClick={onGoogle}
        >
          {t("auth.signInWithGoogle")}
        </Button>
      ) : null}
      {offer === "email" || offer === "google" ? (
        <Button
          type="button"
          variant="outline"
          className="w-full h-11"
          disabled={disabled}
          onClick={onEmailCode}
        >
          {t("auth.sendCodeToEmail")}
        </Button>
      ) : null}
    </div>
  );
}
