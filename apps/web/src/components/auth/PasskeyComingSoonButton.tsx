"use client";

import { Button } from "@/components/ui/button";
import { isAuthPasskeysEnabled } from "@/lib/auth/passkeys-flag";

export function PasskeyComingSoonButton() {
  if (isAuthPasskeysEnabled() === false) return null;
  return (
    <Button
      type="button"
      variant="outline"
      disabled
      className="w-full h-12 rounded-xl border-gray-200 justify-center text-gray-400"
      data-testid="auth-passkey-stub"
    >
      Passkey (coming soon)
    </Button>
  );
}
