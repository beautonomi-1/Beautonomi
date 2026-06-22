"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { AlertCircle, X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  resolveMailableAccountEmail,
  shouldShowEmailVerificationBanner,
} from "@beautonomi/utils";

/**
 * EmailVerificationBanner
 *
 * Shows a banner when the user has a real (mailable) email that is not yet verified.
 * Phone-only and placeholder-email accounts are excluded.
 */
export default function EmailVerificationBanner() {
  const { user, session, resendVerificationEmail } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const authUser = session?.user;

  const mailableEmail = useMemo(
    () => resolveMailableAccountEmail(authUser?.email, user?.email),
    [authUser?.email, user?.email],
  );

  useEffect(() => {
    if (user?.id) {
      const dismissedKey = `email-verification-dismissed-${user.id}`;
      const wasDismissed = localStorage.getItem(dismissedKey) === "true";
      setIsDismissed(wasDismissed);
    }
  }, [user?.id]);

  const shouldShow = Boolean(
    user &&
      session &&
      authUser &&
      !isDismissed &&
      mailableEmail &&
      shouldShowEmailVerificationBanner({
        authEmail: authUser.email,
        profileEmail: user.email,
        emailConfirmedAt: authUser.email_confirmed_at,
        accountCreatedAt: user.created_at ?? authUser.created_at,
      }),
  );

  if (!shouldShow || !mailableEmail) {
    return null;
  }

  const handleResend = async () => {
    try {
      setIsResending(true);
      await resendVerificationEmail();
      toast.success("Verification email sent! Please check your inbox.");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to send verification email. Please try again.";
      toast.error(message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6 rounded-r-lg">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-amber-600" />
        </div>
        <div className="ml-3 flex-1">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-amber-800">
                Verify your email address
              </h3>
              <div className="mt-2 text-sm text-amber-700">
                <p>
                  We&apos;ve sent a verification email to <strong>{mailableEmail}</strong>.
                  Please check your inbox and click the verification link to activate your account.
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResend}
                  disabled={isResending}
                  className="bg-white hover:bg-amber-100 border-amber-300 text-amber-800"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {isResending ? "Sending..." : "Resend verification email"}
                </Button>
              </div>
            </div>
            <button
              onClick={() => {
                setIsDismissed(true);
                if (user?.id) {
                  localStorage.setItem(`email-verification-dismissed-${user.id}`, "true");
                }
              }}
              className="ml-4 flex-shrink-0 text-amber-600 hover:text-amber-800"
              aria-label="Dismiss"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
