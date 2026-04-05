"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FaApple, FaFacebook, FaGoogle } from "react-icons/fa6";
import { CiMail } from "react-icons/ci";
import { X, AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/providers/AuthProvider";
import { PLATFORM_CONTACT_HREF } from "@/lib/routes/platform-contact";
import { useAmplitude } from "@/hooks/useAmplitude";
import { signIn as signInAuth, signUp as signUpAuth, signInWithOAuth, resendVerificationEmail } from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { PhoneInput } from "@/components/ui/phone-input";
import { OtpDigitInput } from "@/components/ui/otp-digit-input";
import { normalizeFullPhoneToE164 } from "@/lib/phone";
import { fetcher } from "@/lib/http/fetcher";
import { supportedLanguages, SIGNUP_SOURCE_OPTIONS } from "@beautonomi/i18n";
import { EVENT_SIGNUP_START, EVENT_SIGNUP_COMPLETE, EVENT_LOGIN_SUCCESS } from "@/lib/analytics/amplitude/types";
import { RADIX_SELECT_NONE } from "@/lib/ui/select-radix-sentinels";
import {
  SUPABASE_AUTH_OTP_LENGTH,
  SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS,
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
} from "@/lib/supabase/auth-sms-otp";
import type { UserRole } from "@/types/beautonomi";

const PENDING_SIGNUP_SOURCE_KEY = "beautonomi_pending_signup_source";
const PENDING_PREFERRED_LANGUAGE_KEY = "beautonomi_pending_preferred_language";
const LOGIN_MODAL_I18N_LABELS: Record<string, string> = {
  "auth.preferredLanguage": "Preferred language",
  "auth.howHearAboutUs": "How did you hear about us?",
  "auth.signupSourceSkip": "Prefer not to say",
  "auth.signupSource.social_media": "Social media",
  "auth.signupSource.friend_family": "Friend or family",
  "auth.signupSource.google_search": "Google search",
  "auth.signupSource.advertisement": "Advertisement",
  "auth.signupSource.other": "Other",
};


interface LoginModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  initialMode?: "login" | "signup";
  redirectContext?: "provider" | "customer"; // Context for where signup was initiated
  /** Runs after successful auth; see skipDefaultSignupRedirect. */
  onAuthSuccess?: () => void;
  redirectUrl?: string; // URL to redirect to after auth (for OAuth callbacks)
  /**
   * When true, email signup skips default router redirects and only runs onAuthSuccess
   * (e.g. pricing → subscription checkout). Default false: navigate first, then onAuthSuccess.
   */
  skipDefaultSignupRedirect?: boolean;
}

export default function LoginModal({
  open,
  setOpen,
  initialMode,
  redirectContext,
  onAuthSuccess,
  redirectUrl,
  skipDefaultSignupRedirect = false,
}: LoginModalProps) {
  const router = useRouter();
  const { refreshUser, role: contextRole, user } = useAuth();
  const { track, isReady } = useAmplitude();
  
  // Close modal and call onAuthSuccess when user becomes authenticated
  useEffect(() => {
    if (user && open && onAuthSuccess) {
      // User just logged in, close modal and call callback
      setOpen(false);
      // Small delay to ensure state is updated
      setTimeout(() => {
        onAuthSuccess();
      }, 300);
    }
  }, [user, open, onAuthSuccess, setOpen]);
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSignup, setIsSignup] = useState(initialMode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneFull, setPhoneFull] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [sentPhoneE164, setSentPhoneE164] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [otpResending, setOtpResending] = useState(false);
  const [emailOtpMode, setEmailOtpMode] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [pendingEmailOtp, setPendingEmailOtp] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState(() => {
    if (typeof navigator !== "undefined" && navigator.language) {
      const code = navigator.language.split("-")[0];
      return supportedLanguages.some((l) => l.code === code) ? code : "en";
    }
    return "en";
  });
  const [signupSource, setSignupSource] = useState<string | null>(null);
  const t = (key: string) => LOGIN_MODAL_I18N_LABELS[key] ?? key;
  const fieldClass = "bg-gray-100 border-gray-200 text-[13px] text-gray-700 placeholder:text-gray-400";
  const labelClass = "text-xs font-medium text-gray-700 mb-2 block";

  useEffect(() => {
    if (isReady && open && isSignup) track(EVENT_SIGNUP_START);
  }, [isReady, open, isSignup, track]);

  // Apply pending signup_source / preferred_language when user becomes available (e.g. after email verification)
  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;
    const pendingSource = sessionStorage.getItem(PENDING_SIGNUP_SOURCE_KEY);
    const pendingLang = sessionStorage.getItem(PENDING_PREFERRED_LANGUAGE_KEY);
    if (!pendingSource && !pendingLang) return;
    const payload: { signup_source?: string; preferred_language?: string } = {};
    if (pendingSource) payload.signup_source = pendingSource;
    if (pendingLang) payload.preferred_language = pendingLang;
    fetcher.patch("/api/me/profile", payload).then(() => {
      sessionStorage.removeItem(PENDING_SIGNUP_SOURCE_KEY);
      sessionStorage.removeItem(PENDING_PREFERRED_LANGUAGE_KEY);
    }).catch(() => {});
  }, [user?.id]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      // If initialMode is provided (login or signup), show email form directly
      // Otherwise, show phone input first
      setShowEmailForm(initialMode === "login" || initialMode === "signup");
      setIsSignup(initialMode === "signup");
      // Don't show password field separately for login mode - we'll show it inline
      setShowPasswordField(false);
      setError(null);
      setEmail("");
      setPassword("");
      setFullName("");
      setPhoneFull("");
      setShowResendVerification(false);
      setShowPassword(false);
      setOtpSent(false);
      setOtpCode("");
      setSentPhoneE164("");
      setOtpExpiresAt(null);
      setOtpSecondsLeft(0);
      setOtpResending(false);
      setEmailOtpMode(false);
      setEmailOtpSent(false);
      setEmailOtpCode("");
      setPendingEmailOtp("");
      const langCode = typeof navigator !== "undefined" && navigator.language
        ? (() => { const c = navigator.language.split("-")[0]; return supportedLanguages.some((l) => l.code === c) ? c : "en"; })()
        : "en";
      setPreferredLanguage(langCode);
      setSignupSource(null);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!otpExpiresAt) {
      setOtpSecondsLeft(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000));
      setOtpSecondsLeft(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [otpExpiresAt]);

  const formatOtpCountdown = (seconds: number) => {
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const handleEmailContinue = () => {
    if (!email) {
      setError("Email is required");
      return;
    }
    setShowPasswordField(true);
    setError(null);
  };

  const handleEmailAuth = async () => {
    // Clear any previous errors immediately
    setError(null);
    setShowResendVerification(false);
    
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    // Trim email and password to avoid whitespace issues
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError("Email and password are required");
      return;
    }

    setIsLoading(true);
    // Ensure error is cleared before attempting login
    setError(null);
    setShowResendVerification(false);

    try {
      const resolveRoleFast = async (providerContext: boolean): Promise<UserRole | null> => {
        try {
          const qs = providerContext ? "?portal=provider" : "";
          const res = await fetch(`/api/me/role${qs}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (!res.ok) return null;
          const json = (await res.json()) as { data?: { role?: UserRole } };
          return json?.data?.role ?? null;
        } catch {
          return null;
        }
      };

      if (isSignup) {
        // Sign up new user
        if (!fullName) {
          setError("Full name is required");
          setIsLoading(false);
          return;
        }

        // Set role based on redirect context - if signing up from provider flow, set as provider_owner
        const userRole = redirectContext === "provider" ? "provider_owner" : "customer";

        const signupResult = await signUpAuth({
          email: trimmedEmail,
          password: trimmedPassword,
          fullName: fullName?.trim(),
          phone: phoneFull ? (normalizeFullPhoneToE164(phoneFull) ?? phoneFull.replace(/\s/g, "").trim()) : undefined,
          role: userRole,
        });

        // Check if we have a session (user is logged in)
        // If email verification is disabled, Supabase returns a session immediately
        // If email verification is enabled, session will be null until email is verified
        if (signupResult?.session) {
          if (isReady) track(EVENT_SIGNUP_COMPLETE, { method: "email" });
          toast.success("Account created successfully! Welcome to Beautonomi.");
          
          // Wait for auth state to update
          await refreshUser();
          
          try {
            await fetcher.patch("/api/me/profile", {
              signup_source: signupSource || undefined,
              preferred_language: preferredLanguage,
            });
          } catch {
            // Non-blocking
          }
          
          // Small delay to ensure auth context is updated
          await new Promise(resolve => setTimeout(resolve, 300));
          
          setOpen(false);

          if (skipDefaultSignupRedirect && onAuthSuccess) {
            onAuthSuccess();
            return;
          }

          if (redirectContext === "provider") {
            router.push("/provider/onboarding");
          } else if (redirectUrl) {
            router.push(redirectUrl);
          } else {
            router.push("/onboarding");
          }
          onAuthSuccess?.();
        } else if (signupResult?.user) {
          // User was created but no session - this means email verification is required
          // Try to sign in immediately as a fallback (in case verification is actually disabled)
          try {
            const loginResult = await signInAuth({ email: trimmedEmail, password: trimmedPassword });
            
            // Check if login actually created a session
            if (loginResult?.session) {
              if (isReady) track(EVENT_SIGNUP_COMPLETE, { method: "email" });
              toast.success("Account created successfully! Welcome to Beautonomi.");
              
              // Wait for auth state to update
              await refreshUser();
              
              // Small delay to ensure auth context is updated
              await new Promise(resolve => setTimeout(resolve, 300));
              
              setOpen(false);

              if (skipDefaultSignupRedirect && onAuthSuccess) {
                onAuthSuccess();
                return;
              }

              if (redirectContext === "provider") {
                router.push("/provider/onboarding");
              } else if (redirectUrl) {
                router.push(redirectUrl);
              } else {
                router.push("/onboarding");
              }
              onAuthSuccess?.();
            } else {
              // Login didn't create a session - email verification is required
              throw new Error("Email verification required");
            }
          } catch (loginError: unknown) {
            // If login fails, email verification is required
            console.log("Auto-login after signup failed, email verification is required:", loginError);
            if (typeof window !== "undefined") {
              if (signupSource) sessionStorage.setItem(PENDING_SIGNUP_SOURCE_KEY, signupSource);
              sessionStorage.setItem(PENDING_PREFERRED_LANGUAGE_KEY, preferredLanguage);
            }
            // Don't close modal or redirect - user needs to verify email first
            toast.success(
              "Account created! Please check your email to verify your account. You'll be able to log in after verification.",
              { duration: 6000 }
            );
            
            // Switch to login mode and show resend verification option
            setIsSignup(false);
            setShowResendVerification(true);
            setShowPasswordField(true);
            
            // Don't redirect - let user verify email first
            // The modal will stay open so they can resend verification if needed
          }
        } else {
          // Unexpected case - user wasn't created
          throw new Error("Failed to create account. Please try again.");
        }
      } else {
        // Sign in existing user
        const loginResult = await signInAuth({ email: trimmedEmail, password: trimmedPassword });
        
        // Clear any errors on successful sign in
        setError(null);
        setShowResendVerification(false);

        // Provider-intent fast path: route immediately, then refresh in background.
        // This avoids waiting on role/profile reads before navigation.
        const providerContext = redirectContext === "provider";
        const providerIntent =
          providerContext ||
          (typeof window !== "undefined" && window.location.pathname.startsWith("/provider"));
        if (providerIntent) {
          if (isReady) track(EVENT_LOGIN_SUCCESS, { method: "email" });
          toast.success("Logged in successfully!");
          setOpen(false);
          router.replace("/provider/dashboard");
          void refreshUser().catch(() => {});
          setIsLoading(false);
          return;
        }

        // Resolve role server-side first (fast path), with provider context upgrade when relevant.
        let finalRole =
          (await resolveRoleFast(providerContext)) ||
          ((loginResult as any)?.user?.user_metadata?.role as UserRole | undefined) ||
          contextRole;

        // Fallback: only if still unknown, perform the slower client refresh sequence.
        if (!finalRole) {
          let updatedUser = await refreshUser();
          let retries = 0;
          while (!updatedUser && retries < 2) {
            await new Promise(resolve => setTimeout(resolve, 500));
            updatedUser = await refreshUser();
            retries++;
          }
          finalRole = updatedUser?.role || contextRole;
        }
        
        // Only close modal and redirect if we have a role
        if (finalRole) {
          // Apply any pending signup_source / preferred_language (e.g. after email verification)
          const pendingSource = typeof window !== "undefined" ? sessionStorage.getItem(PENDING_SIGNUP_SOURCE_KEY) : null;
          const pendingLang = typeof window !== "undefined" ? sessionStorage.getItem(PENDING_PREFERRED_LANGUAGE_KEY) : null;
          if (pendingSource || pendingLang) {
            try {
              await fetcher.patch("/api/me/profile", {
                ...(pendingSource && { signup_source: pendingSource }),
                ...(pendingLang && { preferred_language: pendingLang }),
              });
              sessionStorage.removeItem(PENDING_SIGNUP_SOURCE_KEY);
              sessionStorage.removeItem(PENDING_PREFERRED_LANGUAGE_KEY);
            } catch {
              // Non-blocking
            }
          }
          // Clear any errors before closing
          setError(null);
          setShowResendVerification(false);
          if (isReady) track(EVENT_LOGIN_SUCCESS, { method: "email" });
          toast.success("Logged in successfully!");
          setOpen(false);
          void refreshUser().catch(() => {});
          
          // Role-based redirect after login - immediate redirect
          // Use replace instead of push to avoid back button issues
          if (finalRole === "superadmin") {
            router.replace("/admin/dashboard");
          } else if (finalRole === "provider_owner" || finalRole === "provider_staff") {
            router.replace("/provider/dashboard");
          } else if (redirectUrl) {
            router.replace(redirectUrl);
          } else {
            // If redirectContext is provider, send customers to onboarding to become a provider
            if (providerContext) {
              router.replace("/provider/onboarding");
            } else {
              router.replace("/");
            }
          }
        } else {
          // Role not loaded yet: redirect to /portal so server can route by role (provider → dashboard, etc.)
          setError(null);
          setOpen(false);
          if (isReady) track(EVENT_LOGIN_SUCCESS, { method: "email" });
          toast.success("Logged in successfully!");
          router.replace("/portal");
          setIsLoading(false);
        }
      }
    } catch (error: unknown) {
      console.error("Auth error:", error);
      const errorMessage = error instanceof Error ? error.message : "Authentication failed. Please try again.";
      
      // Check for specific error types
      const lowerErrorMessage = errorMessage.toLowerCase();
      
      // Check if this is specifically an email verification issue
      if (lowerErrorMessage.includes("email not confirmed") || 
          lowerErrorMessage.includes("email_not_confirmed") ||
          lowerErrorMessage.includes("verify your email")) {
        setError("Please verify your email address before logging in. Check your inbox for the verification email.");
        setShowResendVerification(true);
      } 
      // Check if this is invalid credentials (could be wrong password OR unverified email)
      else if (lowerErrorMessage.includes("invalid login credentials") || 
               lowerErrorMessage.includes("invalid credentials")) {
        // Show clear error message
        setError("Invalid login credentials. Please check your email and password.");
        // Show resend verification as a secondary option (less prominent)
        // This helps users who might have unverified emails, but doesn't assume that's the issue
        setShowResendVerification(true);
      } 
      // Other errors
      else {
        setError(errorMessage);
        // Only show resend verification for email-related errors
        if (lowerErrorMessage.includes("email")) {
          setShowResendVerification(true);
        } else {
          setShowResendVerification(false);
        }
      }
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      toast.error("Please enter your email address first");
      return;
    }

    setIsResendingVerification(true);
    try {
      await resendVerificationEmail(email.trim());
      toast.success("Verification email sent! Please check your inbox and spam folder.");
      setShowResendVerification(false);
    } catch (error: unknown) {
      console.error("Error resending verification email:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to send verification email.";
      
      // Check if the error indicates the email doesn't need verification or doesn't exist
      const lowerError = errorMessage.toLowerCase();
      if (lowerError.includes("user not found") || 
          lowerError.includes("email not found") ||
          lowerError.includes("no user found")) {
        toast.error("No account found with this email address. Please check your email or sign up.");
      } else if (lowerError.includes("already verified") || 
                 lowerError.includes("email already confirmed")) {
        toast.error("This email is already verified. Please check your password or try signing in again.");
        setShowResendVerification(false);
      } else {
        toast.error(errorMessage + " Please try again.");
      }
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleEmailButtonClick = () => {
    setShowEmailForm(true);
    // Default to login unless initialMode is explicitly signup
    setIsSignup(initialMode === "signup");
    setError(null);
    setEmailOtpMode(false);
    setEmailOtpSent(false);
    setEmailOtpCode("");
    setPendingEmailOtp("");
  };

  const routeAfterOtpAuth = async () => {
    // Booking and other embedded flows can provide their own post-auth behavior.
    if (onAuthSuccess) return;

    if (redirectContext === "provider") {
      router.replace("/provider/dashboard");
      return;
    }
    if (redirectUrl) {
      router.replace(redirectUrl);
      return;
    }

    try {
      const roleRes = await fetch("/api/me/role", {
        credentials: "include",
        cache: "no-store",
      });
      if (roleRes.ok) {
        const roleJson = (await roleRes.json()) as { data?: { role?: string } };
        const role = roleJson?.data?.role;
        if (role === "superadmin") {
          router.replace("/admin/login?next=%2Fadmin%2Fdashboard");
          return;
        }
        if (role === "provider_owner" || role === "provider_staff" || role === "provider_onboarding") {
          router.replace("/provider/dashboard");
          return;
        }
        if (role === "customer") {
          try {
            const onboardingRes = await fetch("/api/me/onboarding/complete", {
              credentials: "include",
              cache: "no-store",
            });
            if (onboardingRes.ok) {
              const onboardingJson = (await onboardingRes.json()) as {
                data?: { completed?: boolean };
              };
              if (onboardingJson?.data?.completed === false) {
                router.replace("/onboarding");
                return;
              }
            }
          } catch {
            // fall through to bookings
          }
          router.replace("/bookings");
          return;
        }
      }
    } catch {
      // fallback below
    }

    router.replace("/portal");
  };

  const fullPhoneE164 = normalizeFullPhoneToE164(phoneFull) ?? (phoneFull || "").replace(/\s/g, "").trim();
  const isValidE164 = fullPhoneE164.startsWith("+") && fullPhoneE164.length >= 11;

  const handlePhoneSendOtp = async () => {
    if (!isValidE164) {
      setError("Please enter a valid phone number with country code (e.g. +27 82 345 6789)");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: normalizeSupabaseAuthPhone(fullPhoneE164),
        options: { channel: "sms", shouldCreateUser: isSignup },
      });
      if (otpError) throw otpError;
      setSentPhoneE164(normalizeSupabaseAuthPhone(fullPhoneE164));
      setOtpSent(true);
      setOtpCode("");
      const expiresAt = Date.now() + SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS * 1000;
      setOtpExpiresAt(expiresAt);
      toast.success("Check your phone for the verification code");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send code";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendPhoneOtp = async () => {
    if (!sentPhoneE164) return;
    setOtpResending(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: normalizeSupabaseAuthPhone(sentPhoneE164),
        options: { channel: "sms", shouldCreateUser: isSignup },
      });
      if (otpError) throw otpError;
      setOtpCode("");
      const expiresAt = Date.now() + SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS * 1000;
      setOtpExpiresAt(expiresAt);
      toast.success("A new verification code has been sent");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend code";
      setError(msg);
      toast.error(msg);
    } finally {
      setOtpResending(false);
    }
  };

  const handleVerifyOtp = async (codeOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(codeOverride ?? otpCode);
    if (!sentPhoneE164 || !isCompleteSupabaseSmsOtp(token)) return;
    setIsLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: normalizeSupabaseAuthPhone(sentPhoneE164),
        token,
        type: "sms",
      });
      if (verifyError) throw verifyError;
      if (isReady) track(EVENT_LOGIN_SUCCESS, { method: "phone" });
      await refreshUser();
      setOpen(false);
      onAuthSuccess?.();
      await routeAfterOtpAuth();
      toast.success("You're signed in");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid code";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendEmailOtp = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const emailRedirectTo =
        redirectContext === "provider"
          ? `${origin}/auth/callback?next=/provider/dashboard`
          : `${origin}/auth/callback`;
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo, shouldCreateUser: false },
      });
      if (otpError) throw otpError;
      setPendingEmailOtp(trimmed);
      setEmailOtpSent(true);
      setEmailOtpCode("");
      toast.success(`Check your email for the ${SUPABASE_AUTH_OTP_LENGTH}-digit code`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send code";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (codeOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(codeOverride ?? emailOtpCode);
    const addr = pendingEmailOtp || email.trim();
    if (!addr || !isCompleteSupabaseSmsOtp(token)) return;
    setIsLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: addr.trim(),
        token,
        type: "email",
      });
      if (verifyError) throw verifyError;
      if (isReady) track(EVENT_LOGIN_SUCCESS, { method: "email" });
      await refreshUser();
      setOpen(false);
      onAuthSuccess?.();
      await routeAfterOtpAuth();
      toast.success("You're signed in");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid code";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: "google" | "facebook" | "apple") => {
    setIsLoading(true);
    setError(null);

    try {
      // Callback must be /auth/callback so the code can be exchanged. Add next= for post-login redirect.
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const callbackUrl =
        redirectContext === "provider"
          ? `${origin}/auth/callback?next=/provider/dashboard`
          : `${origin}/auth/callback`;
      await signInWithOAuth(provider, callbackUrl);
      // OAuth will redirect, so we don't need to do anything else here
      toast.info(`Redirecting to ${provider}...`);
    } catch (error: unknown) {
      console.error("OAuth error:", error);
      const msg = error instanceof Error ? error.message : `Failed to sign in with ${provider}`;
      setError(msg);
      toast.error(msg);
      setIsLoading(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-[440px] m-0 sm:m-4 p-0 z-[9999] overflow-auto max-h-[90vh] sm:max-h-[85vh] rounded-[28px] sm:rounded-[32px] bg-white shadow-2xl border-0">
        <DialogHeader className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2 relative">
          <button
            onClick={() => setOpen(false)}
            className="absolute left-4 top-4 sm:left-5 sm:top-5 text-gray-500 hover:text-gray-700 p-2 -m-2 rounded-full hover:bg-gray-100 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <DialogTitle className="text-center text-base sm:text-lg font-semibold sr-only">
            Log in or sign up
          </DialogTitle>
          <DialogDescription className="sr-only">
            Log in or create a new Beautonomi account to access all features
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 sm:px-6 pb-6 sm:pb-8 pt-0">
          <h2 className="text-2xl sm:text-[28px] font-bold text-gray-900 tracking-tight mb-1">Welcome to Beautonomi</h2>
          <p className="text-[13px] text-gray-500 mb-7 sm:mb-8">Log in or sign up to continue</p>
          
          {/* Error Message */}
          {error && (
            <div className="mb-5 p-4 bg-red-50/90 border border-red-100 rounded-2xl">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-600">{error}</p>
                  {showResendVerification && (
                    <div className="mt-3">
                      <p className="text-[13px] text-gray-600 mb-2">
                        If you haven&apos;t verified your email yet:
                      </p>
                      <button
                        onClick={handleResendVerification}
                        disabled={isResendingVerification}
                        className="text-sm font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed py-1 rounded-lg touch-manipulation"
                      >
                        {isResendingVerification ? "Sending…" : "Resend verification email"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Phone Input or OTP step (Default) */}
          {!showEmailForm && !otpSent && (
            <>
              <div className="mb-5">
                <PhoneInput
                  label="Phone number"
                  value={phoneFull}
                  onChange={setPhoneFull}
                  defaultCountryCode="+27"
                  placeholder="e.g. 82 123 4567"
                />
              </div>
              
              <p className="mb-6 text-[13px] leading-relaxed text-gray-500">
                We&apos;ll text a {SUPABASE_AUTH_OTP_LENGTH}-digit code (about{" "}
                {Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60))}{" "}
                {Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60) === 1 ? "minute" : "minutes"}). Msg &amp; data rates may apply. By continuing you agree to our{" "}
                <Link href="/terms-and-condition" className="font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900" onClick={() => setOpen(false)}>
                  Terms
                </Link>
                {" "}&amp;{" "}
                <Link href="/privacy-policy" className="font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900" onClick={() => setOpen(false)}>
                  Privacy Policy
                </Link>
                {" "}(incl. communications &amp; analytics; optional session replay when signed in — adjust in account settings).
              </p>
              
              <Button 
                className="w-full rounded-2xl bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary-hover text-white min-h-[52px] h-12 text-base font-semibold mb-6 touch-manipulation shadow-lg shadow-pink-200/40 gap-2"
                onClick={handlePhoneSendOtp}
                disabled={isLoading || !isValidE164}
                aria-busy={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                    Sending code…
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </>
          )}

          {/* OTP verification step (after phone OTP sent) */}
          {!showEmailForm && otpSent && (
            <>
              <p className="text-base sm:text-lg font-semibold text-gray-900 mb-1">Enter verification code</p>
              <p className="mb-5 text-[13px] leading-relaxed text-gray-600 sm:text-sm">
                We sent a {SUPABASE_AUTH_OTP_LENGTH}-digit code to{" "}
                <span className="font-semibold text-gray-900">{sentPhoneE164}</span> (valid about{" "}
                {Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60))}{" "}
                {Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60) === 1 ? "minute" : "minutes"}).
              </p>
              <OtpDigitInput
                value={otpCode}
                onChange={(v) => {
                  setOtpCode(v);
                  if (error) setError(null);
                }}
                onComplete={(code) => {
                  if (!isLoading && isCompleteSupabaseSmsOtp(code)) void handleVerifyOtp(code);
                }}
                disabled={isLoading}
                autoFocus
                label="Phone verification code"
                className="mb-5"
                length={SUPABASE_AUTH_OTP_LENGTH}
              />
              <div className="mb-4 flex items-center justify-between gap-3 text-xs">
                <span className="text-gray-500">
                  Code expires in{" "}
                  <span className="font-semibold text-gray-700">
                    {formatOtpCountdown(otpSecondsLeft)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void handleResendPhoneOtp()}
                  disabled={otpResending || isLoading}
                  className="font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  {otpResending ? "Resending..." : "Resend code"}
                </button>
              </div>
              <Button
                className="w-full rounded-2xl bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary-hover text-white min-h-[52px] h-12 text-base font-semibold mb-4 touch-manipulation shadow-lg shadow-pink-200/40 gap-2"
                onClick={() => void handleVerifyOtp()}
                disabled={isLoading || !isCompleteSupabaseSmsOtp(otpCode)}
                aria-busy={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                    Verifying…
                  </>
                ) : (
                  "Verify"
                )}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtpCode("");
                  setSentPhoneE164("");
                  setError(null);
                }}
                className="w-full py-3 text-[15px] text-gray-500 hover:text-gray-900 font-medium touch-manipulation rounded-xl active:bg-gray-100"
              >
                Use different number
              </button>
            </>
          )}

          {/* Email Form (shown when "Continue with email" is clicked) */}
          {showEmailForm && (
            <>
              {/* Back to phone/social - clear escape hatch */}
              <button
                type="button"
                onClick={() => {
                  setShowEmailForm(false);
                  setShowPasswordField(false);
                  setError(null);
                  setEmailOtpMode(false);
                  setEmailOtpSent(false);
                  setEmailOtpCode("");
                  setPendingEmailOtp("");
                }}
                className="flex items-center gap-2 text-[15px] text-gray-500 hover:text-gray-900 font-medium mb-5 -mx-1 px-1 py-2 rounded-xl active:bg-gray-100 touch-manipulation"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back to phone or social
              </button>
              {/* Step 1: Email Input (or both email and password for login mode) */}
              {!showPasswordField && (
                <>
                  {isSignup && (
                    <div className="mb-4">
                      <Label className={labelClass}>Full name</Label>
                      <Input
                        type="text"
                        className={`${fieldClass} min-h-[48px] h-12 rounded-2xl focus-visible:ring-2 focus-visible:ring-primary/20`}
                        placeholder="Full name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && fullName && email && !isLoading) {
                            handleEmailContinue();
                          }
                        }}
                        autoComplete="name"
                        autoFocus
                      />
                    </div>
                  )}
                  <div className="mb-4">
                    <Label className={labelClass}>Email</Label>
                    <Input
                      type="email"
                      className={`${fieldClass} min-h-[48px] h-12 rounded-2xl focus-visible:ring-2 focus-visible:ring-primary/20`}
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && email && !isLoading) {
                          if (!isSignup && emailOtpMode && !emailOtpSent) {
                            void handleSendEmailOtp();
                            return;
                          }
                          if (initialMode === "login") {
                            const passwordInput = document.querySelector('input[type="password"], input[type="text"][placeholder="Password"]') as HTMLInputElement;
                            if (passwordInput) {
                              passwordInput.focus();
                            } else {
                              handleEmailContinue();
                            }
                          } else {
                            handleEmailContinue();
                          }
                        }
                      }}
                      autoComplete={isSignup ? "email" : "username"}
                      inputMode="email"
                      autoFocus={!isSignup}
                    />
                  </div>
                  {!isSignup && emailOtpSent && (
                    <>
                      <p className="text-base sm:text-lg font-semibold text-gray-900 mb-1">Enter verification code</p>
                      <p className="mb-5 text-[13px] leading-relaxed text-gray-600 sm:text-sm">
                        Enter the {SUPABASE_AUTH_OTP_LENGTH}-digit code we sent to{" "}
                        <span className="font-semibold text-gray-900">{pendingEmailOtp || email.trim()}</span>
                      </p>
                      <OtpDigitInput
                        value={emailOtpCode}
                        onChange={(v) => {
                          setEmailOtpCode(v);
                          if (error) setError(null);
                        }}
                        onComplete={(code) => {
                          if (!isLoading && isCompleteSupabaseSmsOtp(code)) void handleVerifyEmailOtp(code);
                        }}
                        disabled={isLoading}
                        autoFocus
                        label="Email verification code"
                        className="mb-5"
                        length={SUPABASE_AUTH_OTP_LENGTH}
                      />
                      <Button
                        className="w-full rounded-2xl bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary-hover text-white min-h-[52px] h-12 text-base font-semibold mb-4 touch-manipulation shadow-lg shadow-pink-200/40 gap-2"
                        onClick={() => void handleVerifyEmailOtp()}
                        disabled={isLoading || !isCompleteSupabaseSmsOtp(emailOtpCode)}
                        aria-busy={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                            Verifying…
                          </>
                        ) : (
                          "Verify"
                        )}
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          setEmailOtpSent(false);
                          setEmailOtpCode("");
                          setPendingEmailOtp("");
                          setError(null);
                        }}
                        className="w-full py-3 text-[15px] text-gray-500 hover:text-gray-900 font-medium touch-manipulation rounded-xl active:bg-gray-100 mb-6"
                      >
                        Use a different email
                      </button>
                    </>
                  )}

                  {!isSignup && emailOtpMode && !emailOtpSent && (
                    <p className="mb-5 text-[13px] leading-relaxed text-gray-600">
                      We&apos;ll email you a {SUPABASE_AUTH_OTP_LENGTH}-digit verification code.
                    </p>
                  )}

                  {/* Show password field immediately in login mode (when not signup and not email OTP flow) */}
                  {!isSignup && !emailOtpMode && !emailOtpSent && (
                    <div className="mb-5">
                      <Label className={labelClass}>Password</Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          className={`${fieldClass} min-h-[48px] h-12 rounded-2xl pr-12 focus-visible:ring-2 focus-visible:ring-primary/20`}
                          placeholder="Password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (error) {
                              setError(null);
                              setShowResendVerification(false);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && email && password && !isLoading) {
                              handleEmailAuth();
                            }
                          }}
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          tabIndex={0}
                        >
                          {showPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                  {!isSignup && !emailOtpMode && !emailOtpSent && (
                    <div className="mb-5 text-center">
                      <Link
                        href="/forgot-password"
                        onClick={() => setOpen(false)}
                        className="text-[15px] text-gray-500 hover:text-primary font-medium py-2 inline-block touch-manipulation"
                      >
                        Forgot your password? <span className="text-primary font-semibold">Reset it</span>
                      </Link>
                    </div>
                  )}
                  {!isSignup && !emailOtpMode && !emailOtpSent && (
                    <div className="mb-5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setEmailOtpMode(true);
                          setPassword("");
                          setEmailOtpSent(false);
                          setEmailOtpCode("");
                          setPendingEmailOtp("");
                          setError(null);
                        }}
                        className="text-[15px] text-gray-600 hover:text-gray-900 font-medium py-2 touch-manipulation"
                      >
                        Sign in with <span className="text-primary font-semibold">email code</span> instead
                      </button>
                    </div>
                  )}
                  {!isSignup && emailOtpMode && !emailOtpSent && (
                    <div className="mb-5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setEmailOtpMode(false);
                          setEmailOtpSent(false);
                          setEmailOtpCode("");
                          setPendingEmailOtp("");
                          setError(null);
                        }}
                        className="text-[15px] text-gray-600 hover:text-gray-900 font-medium py-2 touch-manipulation"
                      >
                        Use password instead
                      </button>
                    </div>
                  )}

                  {isSignup && (
                    <Button
                      className="w-full rounded-2xl bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary-hover text-white min-h-[52px] h-12 text-base font-semibold mb-6 touch-manipulation shadow-lg shadow-pink-200/40"
                      onClick={handleEmailContinue}
                      disabled={isLoading || !email}
                    >
                      Continue
                    </Button>
                  )}
                  {!isSignup && !emailOtpSent && !emailOtpMode && (
                    <Button
                      className="w-full rounded-2xl bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary-hover text-white min-h-[52px] h-12 text-base font-semibold mb-6 touch-manipulation shadow-lg shadow-pink-200/40 gap-2"
                      onClick={handleEmailAuth}
                      disabled={isLoading || !email || !password}
                      aria-busy={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                          Signing in…
                        </>
                      ) : (
                        "Log in"
                      )}
                    </Button>
                  )}
                  {!isSignup && emailOtpMode && !emailOtpSent && (
                    <Button
                      className="w-full rounded-2xl bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary-hover text-white min-h-[52px] h-12 text-base font-semibold mb-6 touch-manipulation shadow-lg shadow-pink-200/40 gap-2"
                      onClick={() => void handleSendEmailOtp()}
                      disabled={isLoading || !email.trim()}
                      aria-busy={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                          Sending…
                        </>
                      ) : (
                        "Send code"
                      )}
                    </Button>
                  )}

                  {!( !isSignup && emailOtpSent) && (
                    <>
                  {/* Separator */}
                  <div className="flex items-center my-6">
                    <div className="flex-grow border-t border-gray-200 rounded-full"></div>
                    <span className="flex-shrink mx-4 text-[13px] text-gray-400 font-medium">or</span>
                    <div className="flex-grow border-t border-gray-200 rounded-full"></div>
                  </div>

                  {/* Social Login Options */}
                  <Button
                    variant="outline"
                    className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                    onClick={() => handleSocialLogin("google")}
                    disabled={isLoading}
                  >
                    <FaGoogle className="text-lg shrink-0" />
                    <span>Continue with Google</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                    onClick={() => handleSocialLogin("apple")}
                    disabled={isLoading}
                  >
                    <FaApple className="text-lg shrink-0" />
                    <span>Continue with Apple</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                    onClick={() => {
                      setShowEmailForm(false);
                      setError(null);
                      setEmailOtpMode(false);
                      setEmailOtpSent(false);
                      setEmailOtpCode("");
                      setPendingEmailOtp("");
                    }}
                    disabled={isLoading}
                  >
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>Continue with Phone</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                    onClick={() => handleSocialLogin("facebook")}
                    disabled={isLoading}
                  >
                    <FaFacebook className="text-lg text-blue-600 shrink-0" />
                    <span>Continue with Facebook</span>
                  </Button>

                  {/* Need help link */}
                  <div className="text-center mt-6">
                    <button
                      onClick={() => {
                        window.open(PLATFORM_CONTACT_HREF, "_blank");
                      }}
                      className="text-[15px] text-gray-500 hover:text-gray-900 font-medium py-2 touch-manipulation"
                    >
                      Need help?
                    </button>
                  </div>
                    </>
                  )}
                </>
              )}

              {/* Step 2: Password Input (after email is entered) */}
              {showPasswordField && (
                <>
                  <div className="mb-5">
                    <Label className={labelClass}>Password</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        className={`${fieldClass} min-h-[48px] h-12 rounded-2xl pr-12 focus-visible:ring-2 focus-visible:ring-primary/20`}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) {
                            setError(null);
                            setShowResendVerification(false);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && email && password && !isLoading) {
                            handleEmailAuth();
                          }
                        }}
                        autoComplete={isSignup ? "new-password" : "current-password"}
                        autoFocus={showPasswordField}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        tabIndex={0}
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                  {isSignup && (
                    <>
                      <div className="mb-5">
                        <Label className={labelClass}>{t("auth.preferredLanguage")}</Label>
                        <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
                          <SelectTrigger className={`w-full min-h-[48px] h-12 rounded-2xl ${fieldClass}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {supportedLanguages.map((lang) => (
                              <SelectItem key={lang.code} value={lang.code}>
                                {lang.nativeName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="mb-5">
                        <Label className={labelClass}>
                          {t("auth.howHearAboutUs")} <span className="text-gray-500 font-normal">(optional)</span>
                        </Label>
                        <Select
                          value={signupSource ?? RADIX_SELECT_NONE}
                          onValueChange={(v) => setSignupSource(v === RADIX_SELECT_NONE ? null : v)}
                        >
                          <SelectTrigger className={`w-full min-h-[48px] h-12 rounded-2xl ${fieldClass}`}>
                            <SelectValue placeholder={t("auth.signupSourceSkip")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={RADIX_SELECT_NONE}>{t("auth.signupSourceSkip")}</SelectItem>
                            {SIGNUP_SOURCE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {t(opt.labelKey)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  <Button 
                    className="w-full rounded-2xl bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary-hover text-white min-h-[52px] h-12 text-base font-semibold mb-5 touch-manipulation shadow-lg shadow-pink-200/40 gap-2"
                    onClick={handleEmailAuth}
                    disabled={isLoading || !password}
                    aria-busy={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
                        {isSignup ? "Creating account…" : "Signing in…"}
                      </>
                    ) : isSignup ? (
                      "Sign up"
                    ) : (
                      "Log in"
                    )}
                  </Button>
                  <div className="text-center space-y-1">
                    {!isSignup && (
                      <Link
                        href="/forgot-password"
                        onClick={() => setOpen(false)}
                        className="block w-full py-3 text-[15px] text-primary hover:underline font-medium touch-manipulation"
                      >
                        Forgot your password?
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        setShowPasswordField(false);
                        setError(null);
                      }}
                      className="block w-full py-3 text-[15px] text-gray-500 hover:text-gray-900 font-medium touch-manipulation rounded-xl active:bg-gray-100"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        setIsSignup(!isSignup);
                        setError(null);
                        setEmailOtpMode(false);
                        setEmailOtpSent(false);
                        setEmailOtpCode("");
                        setPendingEmailOtp("");
                      }}
                      className="block w-full py-3 text-[15px] text-gray-600 hover:text-gray-900 font-medium touch-manipulation rounded-xl active:bg-gray-100"
                    >
                      {isSignup ? "Already have an account? Log in" : "Don't have an account? Sign up"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Separator - same as mobile: between phone block and social/email */}
          {!showEmailForm && !otpSent && (
            <div className="flex items-center my-6">
              <div className="flex-grow border-t border-gray-200 rounded-full"></div>
              <span className="flex-shrink mx-4 text-[13px] text-gray-400 font-medium">or</span>
              <div className="flex-grow border-t border-gray-200 rounded-full"></div>
            </div>
          )}

          {/* Social Login Options - order: Google, Apple, Continue with email, Facebook */}
          {!showEmailForm && !otpSent && (
            <>
              <Button
                variant="outline"
                className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                onClick={() => handleSocialLogin("google")}
                disabled={isLoading}
              >
                <FaGoogle className="text-lg shrink-0" />
                <span>Continue with Google</span>
              </Button>
              
              <Button
                variant="outline"
                className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                onClick={() => handleSocialLogin("apple")}
                disabled={isLoading}
              >
                <FaApple className="text-lg shrink-0" />
                <span>Continue with Apple</span>
              </Button>
              
              <Button
                variant="outline"
                className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                onClick={handleEmailButtonClick}
                disabled={isLoading}
              >
                <CiMail className="text-lg shrink-0" />
                <span>Continue with email</span>
              </Button>
              
              <Button
                variant="outline"
                className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                onClick={() => handleSocialLogin("facebook")}
                disabled={isLoading}
              >
                <FaFacebook className="text-lg text-blue-600 shrink-0" />
                <span>Continue with Facebook</span>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}