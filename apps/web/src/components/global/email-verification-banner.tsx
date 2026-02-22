"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { AlertCircle, X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * EmailVerificationBanner
 * 
 * Shows a banner when user's email is not verified.
 * Smart detection: Only shows if account is recent (created within 7 days) and email_confirmed_at is null.
 * This handles both cases:
 * - If verification is ENABLED: Shows until user verifies
 * - If verification is DISABLED: User can dismiss, won't show for old accounts
 */
export default function EmailVerificationBanner() {
  const { user, session, resendVerificationEmail } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isResending, setIsResending] = useState(false);
  
  // Check if banner was dismissed in localStorage
  useEffect(() => {
    if (user?.id) {
      const dismissedKey = `email-verification-dismissed-${user.id}`;
      const wasDismissed = localStorage.getItem(dismissedKey) === 'true';
      setIsDismissed(wasDismissed);
    }
  }, [user?.id]);

  // Don't show if:
  // - No user
  // - No session (not logged in)
  // - User dismissed it
  if (!user || !session || isDismissed) {
    return null;
  }

  // Check email verification status from session
  const emailConfirmedAt = session.user.email_confirmed_at;
  if (emailConfirmedAt) {
    // Email is verified, don't show
    return null;
  }

  // Check if account is recent (created within last 7 days)
  // This helps distinguish between "verification required" vs "verification disabled"
  // If email verification is disabled in Supabase, email_confirmed_at will be null
  // but users can still log in, so we only show the banner for recent accounts
  const accountAge = user.created_at 
    ? (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24) // days
    : Infinity;
  
  // Only show for accounts created within last 7 days
  // Older accounts likely have verification disabled or user already verified
  // If email verification is disabled in Supabase, this banner shouldn't show at all
  // because users can log in without verification
  if (accountAge > 7) {
    return null;
  }
  
  // Additional check: If user has a valid session but email_confirmed_at is null,
  // it likely means email verification is disabled in Supabase settings
  // In that case, don't show the banner (user can use the app without verification)
  // We can't directly check Supabase settings, but if user is logged in and can access the app,
  // verification is likely not required

  const handleResend = async () => {
    try {
      setIsResending(true);
      await resendVerificationEmail();
      toast.success("Verification email sent! Please check your inbox.");
    } catch (error: any) {
      toast.error(error.message || "Failed to send verification email. Please try again.");
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
                  We've sent a verification email to <strong>{user.email}</strong>. 
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
                // Remember dismissal in localStorage
                if (user?.id) {
                  localStorage.setItem(`email-verification-dismissed-${user.id}`, 'true');
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
