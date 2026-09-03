"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function SetPasswordOffer({
  open,
  onSkip,
}: {
  open: boolean;
  onSkip: () => void;
}) {
  if (open === false) return null;
  return (
    <div
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
      data-testid="set-password-offer"
      role="status"
    >
      <p className="text-sm font-semibold text-gray-900 mb-1">Add a password</p>
      <p className="text-xs text-gray-600 mb-3">
        You signed in without a password. Add one so you can sign in with email next time.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button asChild className="h-10">
          <Link href="/account-settings/login-and-security">Set a password</Link>
        </Button>
        <Button type="button" variant="outline" className="h-10" onClick={onSkip}>
          Not now
        </Button>
      </div>
    </div>
  );
}
