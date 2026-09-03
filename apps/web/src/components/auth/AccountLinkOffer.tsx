"use client";

import { Button } from "@/components/ui/button";

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
  if (!offer) return null;
  return (
    <div className="mt-3 space-y-2" data-testid="account-link-offer">
      <p className="text-xs text-gray-600">This email is already registered.</p>
      {offer === "google" ? (
        <Button
          type="button"
          variant="outline"
          className="w-full h-11"
          disabled={disabled}
          onClick={onGoogle}
        >
          Sign in with Google
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
          Send code to this email
        </Button>
      ) : null}
    </div>
  );
}
