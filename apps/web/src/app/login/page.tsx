"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
// Side-effect: initialize i18next before first render so `useTranslation` is
// stable (hook order changes if the instance appears mid-session).
import "@/lib/i18n";
import { useTranslation } from "@beautonomi/i18n";
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Smartphone, ArrowLeft } from "lucide-react";
import { FaApple, FaGoogle } from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { OtpDigitInput } from "@/components/ui/otp-digit-input";
import { useAuth } from "@/providers/AuthProvider";
import { useAmplitude } from "@/hooks/useAmplitude";
import { EVENT_LOGIN_SUCCESS } from "@/lib/analytics/amplitude/types";
import { signInWithOAuth } from "@/lib/supabase/auth";
import { sendAuthOtp, verifyAuthOtp, AuthOtpError } from "@/lib/auth/auth-otp-client";
import { shouldOfferSetPassword } from "@/lib/auth/account-link";
import { AuthTurnstile } from "@/components/auth/AuthTurnstile";
import { PasskeyComingSoonButton } from "@/components/auth/PasskeyComingSoonButton";
import { SetPasswordOffer } from "@/components/auth/SetPasswordOffer";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS,
  SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS,
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteOtpForLength,
} from "@/lib/supabase/auth-sms-otp";
import { toast } from "sonner";
import logo from "../../../public/images/logo.svg";
import type { UserRole } from "@/types/beautonomi";
import {
  isCustomerSkewedPostLoginPath,
  sanitizeRelativeRedirect,
} from "@/lib/auth/post-login-return-path";
import { isCompleteE164 } from "@/lib/phone";
import { writeSignupPhoneHandoff } from "@/lib/auth/signup-phone-handoff";
import { getSocialAuthConfig } from "@/lib/social-auth-config";
import { DEFAULT_PUBLIC_AUTH, finalizePublicAuth, type PublicAuthPolicy } from "@/lib/config/auth-policy-public";

/**
 * Translate Supabase auth error strings to user-friendly copy.
 * Falls back to the original message so engineers can still debug.
 */
function friendlyAuthErrorMessage(raw: string, channel: "phone" | "email"): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("for security purposes") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  ) {
    return "Too many attempts. Please wait a moment before trying again.";
  }
  if (lower.includes("invalid phone")) return "That phone number doesn't look right. Double-check the country code.";
  if (lower.includes("invalid email")) return "That email address doesn't look right.";
  if (lower.includes("signups not allowed") || lower.includes("signup is disabled")) {
    return channel === "phone"
      ? "Phone sign-ups are currently disabled. Try email or social sign-in."
      : "Email sign-ups are currently disabled. Try phone or social sign-in.";
  }
  if (lower.includes("user not found")) {
    return "We couldn't find an account. New here? Verify the code to create one.";
  }
  if (lower.includes("token has expired") || lower.includes("otp_expired")) {
    return "That code has expired. Request a new one and try again.";
  }
  if (lower.includes("invalid otp") || lower.includes("invalid token") || lower.includes("otp_invalid")) {
    return "That code doesn't match. Check the digits and try again.";
  }
  return raw;
}

type LoginMethod = "phone" | "email";
type EmailMode = "otp" | "password";
type AnalyticsMethod = "phone" | "email" | "google" | "apple";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const { refreshUser, role: contextRole, signIn: signInWithSession } = useAuth();
  const { track, isReady: analyticsReady } = useAmplitude();
  const rawNext = searchParams.get("next") || searchParams.get("redirect") || "";
  const nextUrl = sanitizeRelativeRedirect(rawNext) ?? "";
  const initialAuthError = searchParams.get("error")?.trim() || null;

  /** Journey: Phone | Email segmented control; email defaults to passwordless code. */
  const [selectedMethod, setMethod] = useState<LoginMethod>("phone");
  const [emailMode, setEmailMode] = useState<EmailMode>("otp");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [phoneFull, setPhoneFull] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [sentPhoneE164, setSentPhoneE164] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [otpResending, setOtpResending] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [sentEmailForOtp, setSentEmailForOtp] = useState("");
  const [emailOtpExpiresAt, setEmailOtpExpiresAt] = useState<number | null>(null);
  const [emailOtpSecondsLeft, setEmailOtpSecondsLeft] = useState(0);
  const [emailOtpResending, setEmailOtpResending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(initialAuthError);
  const [infoBanner, setInfoBanner] = useState<string | null>(null);
  const [phoneInputError, setPhoneInputError] = useState<string | null>(null);
  const [emailInputError, setEmailInputError] = useState<string | null>(null);
  const [passwordFailedSuggestOtp, setPasswordFailedSuggestOtp] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [offerSetPassword, setOfferSetPassword] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [emailOtpResendCooldown, setEmailOtpResendCooldown] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [publicAuth, setPublicAuth] = useState<PublicAuthPolicy>(DEFAULT_PUBLIC_AUTH);
  const [socialAuth, setSocialAuth] = useState<{ google: boolean; apple: boolean }>({
    google: true,
    apple: true,
  });

  const phoneEnabled = publicAuth.phone_provider_enabled;
  const emailEnabled = publicAuth.email_provider_enabled;
  const hasSocialAuth = socialAuth.google || socialAuth.apple;
  // Provider gating (derived, no effect needed): if the selected method is
  // disabled by platform policy, fall back to the enabled one.
  const method: LoginMethod =
    selectedMethod === "phone" && !phoneEnabled && emailEnabled
      ? "email"
      : selectedMethod === "email" && !emailEnabled && phoneEnabled
        ? "phone"
        : selectedMethod;
  const inOtpStep = (method === "phone" && otpSent) || (method === "email" && emailMode === "otp" && emailOtpSent);

  React.useEffect(() => {
    let cancelled = false;
    const env = process.env.NODE_ENV === "development" ? "development" : "production";
    void fetch(`/api/public/config-bundle?platform=web&environment=${env}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { auth?: Partial<PublicAuthPolicy> } | null) => {
        if (cancelled || !json?.auth) return;
        setPublicAuth(finalizePublicAuth({ ...DEFAULT_PUBLIC_AUTH, ...json.auth }));
      })
      .catch(() => {});
    void getSocialAuthConfig()
      .then((cfg) => {
        if (!cancelled) setSocialAuth(cfg);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const getRedirectUrl = () => {
    if (typeof window === "undefined") return "/auth/callback";
    const base = window.location.origin;
    const next = sanitizeRelativeRedirect(nextUrl) ?? "/";
    return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
  };

  const resolveRoleFast = async (): Promise<UserRole | null> => {
    try {
      const isProviderContext = nextUrl.startsWith("/provider");
      const qs = isProviderContext ? "?portal=provider" : "";
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

  const getCustomerPostAuthRoute = async (): Promise<string> => {
    try {
      const res = await fetch("/api/me/onboarding/complete", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const json = (await res.json()) as {
          data?: { completed?: boolean };
        };
        if (json?.data?.completed === false) {
          return "/onboarding";
        }
      }
    } catch {
      // fall back to bookings
    }
    return "/bookings";
  };

  const redirectByRole = async (finalRole: string) => {
    const next = sanitizeRelativeRedirect(nextUrl);
    let nextPathname: string | null = null;
    if (next) {
      try {
        nextPathname = new URL(next, typeof window !== "undefined" ? window.location.origin : "https://example.com").pathname;
      } catch {
        nextPathname = null;
      }
    }

    const isProviderFamily =
      finalRole === "provider_owner" ||
      finalRole === "provider_staff" ||
      finalRole === "provider_onboarding";

    if (finalRole === "provider_onboarding") {
      const providerSetupTarget =
        nextPathname?.startsWith("/provider/onboarding") || nextPathname?.startsWith("/provider/get-started")
          ? next
          : "/provider/get-started";
      router.replace(providerSetupTarget);
      return;
    }

    if (next && next !== "/login" && !next.includes("signup")) {
      if (isProviderFamily) {
        const allowNext =
          (nextPathname?.startsWith("/provider") ?? false) ||
          (nextPathname != null && !isCustomerSkewedPostLoginPath(nextPathname));
        if (allowNext) {
          router.replace(next);
          return;
        }
      } else {
        router.replace(next);
        return;
      }
    }
    // Superadmin must use dedicated admin login; send them there (they are already signed in, so /admin/login will redirect to dashboard)
    if (finalRole === "superadmin") {
      const adminNext = next?.startsWith("/admin") ? next : "/admin/dashboard";
      router.replace(`/admin/login${adminNext ? `?next=${encodeURIComponent(adminNext)}` : ""}`);
      return;
    }
    // Redirect by role so provider/customer land in the right place
    if (finalRole === "provider_owner" || finalRole === "provider_staff") {
      router.replace("/provider/dashboard");
      return;
    }
    if (finalRole === "customer") {
      const target = await getCustomerPostAuthRoute();
      router.replace(target);
      return;
    }
    // Fallback: /portal routes by role server-side (e.g. provider_onboarding)
    router.replace("/portal");
  };

  const formatOtpCountdown = (seconds: number) => {
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  React.useEffect(() => {
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

  React.useEffect(() => {
    if (!emailOtpExpiresAt) {
      setEmailOtpSecondsLeft(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((emailOtpExpiresAt - Date.now()) / 1000));
      setEmailOtpSecondsLeft(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [emailOtpExpiresAt]);

  React.useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const id = window.setInterval(() => setOtpResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [otpResendCooldown]);

  React.useEffect(() => {
    if (emailOtpResendCooldown <= 0) return;
    const id = window.setInterval(() => setEmailOtpResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [emailOtpResendCooldown]);

  const routeAfterAuth = async (analyticsMethod: AnalyticsMethod) => {
    if (analyticsReady) track(EVENT_LOGIN_SUCCESS, { method: analyticsMethod, surface: "login_page" });
    let userRole = (await resolveRoleFast()) || contextRole;
    if (!userRole) {
      let updatedUser = await refreshUser();
      let retries = 0;
      while (!updatedUser && retries < 2) {
        await new Promise((r) => setTimeout(r, 500));
        updatedUser = await refreshUser();
        retries++;
      }
      userRole = updatedUser?.role ?? contextRole;
    }
    if (userRole) {
      toast.success("Logged in successfully!");
      void refreshUser().catch(() => {});
      await redirectByRole(userRole);
    } else {
      toast.success("Logged in successfully!");
      router.replace("/portal");
    }
  };

  const handlePhoneSendOtp = async () => {
    const normalizedPhone = (phoneFull || "").replace(/\s/g, "").trim();
    if (!isCompleteE164(normalizedPhone)) {
      const msg = "Please enter a valid phone number with country code (e.g. +27 82 345 6789).";
      setPhoneInputError(msg);
      setFormError(msg);
      return;
    }
    setPhoneInputError(null);
    setLoading(true);
    setFormError(null);
    setInfoBanner(null);
    try {
      const phone = normalizeSupabaseAuthPhone(normalizedPhone);
      await sendAuthOtp({ phone, captchaToken });
      setCaptchaRequired(false);
      setSentPhoneE164(phone);
      setOtpSent(true);
      setOtpCode("");
      setOtpExpiresAt(Date.now() + publicAuth.sms_otp_expiration_seconds * 1000);
      setOtpResendCooldown(SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS);
      setInfoBanner(`Code sent. Valid for about ${Math.max(1, Math.round(publicAuth.sms_otp_expiration_seconds / 60))} min.`);
    } catch (err: unknown) {
      if (err instanceof AuthOtpError && err.captchaRequired) setCaptchaRequired(true);
      const msg = err instanceof Error ? err.message : "Failed to send OTP";
      setFormError(friendlyAuthErrorMessage(msg, "phone"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (codeOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(codeOverride ?? otpCode);
    if (!sentPhoneE164 || !isCompleteOtpForLength(token, publicAuth.sms_otp_length)) return;
    setLoading(true);
    setFormError(null);
    try {
      const { identities } = await verifyAuthOtp({ phone: sentPhoneE164, token, type: "sms" });
      writeSignupPhoneHandoff(sentPhoneE164);
      if (shouldOfferSetPassword(identities)) {
        setOfferSetPassword(true);
        return;
      }
      await routeAfterAuth("phone");
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Invalid code";
      const msg = friendlyAuthErrorMessage(raw, "phone");
      setFormError(msg);
      setOtpCode("");
    } finally {
      setLoading(false);
    }
  };

  const resetPhoneOtpFlow = () => {
    setOtpSent(false);
    setOtpCode("");
    setSentPhoneE164("");
    setOtpExpiresAt(null);
    setInfoBanner(null);
  };

  const resetEmailOtpFlow = () => {
    setEmailOtpSent(false);
    setEmailOtpCode("");
    setSentEmailForOtp("");
    setEmailOtpExpiresAt(null);
    setInfoBanner(null);
  };

  const handleEmailSendOtp = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      const msg = "Please enter your email";
      setEmailInputError(msg);
      setFormError(msg);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      const msg = "Please enter a valid email address";
      setEmailInputError(msg);
      setFormError(msg);
      return;
    }
    setEmailInputError(null);
    setLoading(true);
    setFormError(null);
    setInfoBanner(null);
    try {
      await sendAuthOtp({ email: trimmedEmail, captchaToken });
      setCaptchaRequired(false);
      setSentEmailForOtp(trimmedEmail);
      setEmailOtpSent(true);
      setEmailOtpCode("");
      setEmailOtpExpiresAt(Date.now() + publicAuth.email_otp_expiration_seconds * 1000);
      setEmailOtpResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
      setInfoBanner("Code sent. Check your inbox (and spam folder).");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send email code";
      setFormError(friendlyAuthErrorMessage(msg, "email"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (codeOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(codeOverride ?? emailOtpCode);
    if (!sentEmailForOtp || !isCompleteOtpForLength(token, publicAuth.email_otp_length)) return;
    setLoading(true);
    setFormError(null);
    try {
      const { identities } = await verifyAuthOtp({ email: sentEmailForOtp, token, type: "email" });
      if (shouldOfferSetPassword(identities)) {
        setOfferSetPassword(true);
        return;
      }
      await routeAfterAuth("email");
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : "Invalid code";
      const msg = friendlyAuthErrorMessage(raw, "email");
      setFormError(msg);
      setEmailOtpCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmailOtp = async () => {
    if (!sentEmailForOtp || emailOtpResendCooldown > 0) return;
    setEmailOtpResending(true);
    setFormError(null);
    try {
      await sendAuthOtp({ email: sentEmailForOtp, captchaToken });
      setEmailOtpCode("");
      setEmailOtpExpiresAt(Date.now() + publicAuth.email_otp_expiration_seconds * 1000);
      setEmailOtpResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
      setInfoBanner("A new verification code has been sent.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend code";
      setFormError(friendlyAuthErrorMessage(msg, "email"));
    } finally {
      setEmailOtpResending(false);
    }
  };

  const handleResendPhoneOtp = async () => {
    if (!sentPhoneE164 || otpResendCooldown > 0) return;
    setOtpResending(true);
    setFormError(null);
    try {
      await sendAuthOtp({ phone: normalizeSupabaseAuthPhone(sentPhoneE164), captchaToken });
      setOtpCode("");
      setOtpExpiresAt(Date.now() + publicAuth.sms_otp_expiration_seconds * 1000);
      setOtpResendCooldown(SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS);
      setInfoBanner("A new verification code has been sent.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend code";
      setFormError(friendlyAuthErrorMessage(msg, "phone"));
    } finally {
      setOtpResending(false);
    }
  };

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setPasswordFailedSuggestOtp(false);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError("Please enter your email");
      return;
    }
    if (!password) {
      setFormError("Please enter your password");
      return;
    }
    setLoading(true);
    try {
      await signInWithSession(trimmedEmail, password, { rememberMe, captchaToken });
      setCaptchaRequired(false);
      setFormError(null);
      await routeAfterAuth("email");
    } catch (err: unknown) {
      if (err && typeof err === "object" && "captchaRequired" in err && (err as { captchaRequired?: boolean }).captchaRequired) {
        setCaptchaRequired(true);
      }
      const msg = err instanceof Error ? err.message : "Login failed. Please try again.";
      const lower = msg.toLowerCase();
      // Accounts created via OTP/social have no password — guide users to email-code login.
      const looksLikeOtpOnlyAccount =
        lower.includes("invalid login credentials") ||
        lower.includes("invalid_credentials") ||
        lower.includes("email not confirmed") ||
        lower.includes("email_not_confirmed");
      setPasswordFailedSuggestOtp(looksLikeOtpOnlyAccount);
      setFormError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialOAuth(provider: "google" | "apple") {
    setFormError(null);
    setLoading(true);
    try {
      await signInWithOAuth(provider, getRedirectUrl());
      toast.info(
        provider === "google" ? "Redirecting to Google…" : "Redirecting to Apple…",
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : `Sign in with ${provider === "google" ? "Google" : "Apple"} failed.`;
      setFormError(msg);
      setLoading(false);
    }
  }

  const switchMethod = (target: LoginMethod) => {
    if (target === method) return;
    resetPhoneOtpFlow();
    resetEmailOtpFlow();
    setMethod(target);
    setEmailMode("otp");
    setFormError(null);
    setPasswordFailedSuggestOtp(false);
  };

  const trackPasswordCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(e.getModifierState?.("CapsLock") ?? false);
  };

  const smsExpiryMin = Math.max(1, Math.round(publicAuth.sms_otp_expiration_seconds / 60));
  const emailExpiryMin = Math.max(1, Math.round(publicAuth.email_otp_expiration_seconds / 60));

  const primaryCtaClasses =
    "w-full h-12 rounded-xl text-base font-bold bg-primary hover:bg-primary-hover text-white transition-colors";

  const spinner = (
    <span
      className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"
      aria-hidden
    />
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-white via-white to-primary/[0.04] px-4 py-12">
      <main className="w-full max-w-[420px]" aria-labelledby="login-heading">
        <div className="text-center">
          <Link href="/" className="inline-block mb-6" aria-label="Beautonomi home">
            <Image src={logo} alt="Beautonomi" className="h-8 w-auto" />
          </Link>
          <SetPasswordOffer
            open={offerSetPassword}
            onSkip={() => {
              setOfferSetPassword(false);
              void routeAfterAuth("email");
            }}
          />
          <h1 className="text-[28px] font-extrabold tracking-tight text-gray-900 mb-1.5" id="login-heading">
            Welcome back
          </h1>
          <p className="text-[15px] leading-6 text-gray-500 mb-2">
            Sign in or create an account — we&apos;ll set you up when you verify.
          </p>
          <p className="text-xs text-gray-400 mb-6">
            Continue with phone, email{hasSocialAuth ? ", Google, or Apple" : ", or password"}.
          </p>
        </div>

        {/* Live region: errors */}
        {formError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 mb-4" role="alert">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" aria-hidden />
            <div className="flex-1">
              <p className="text-sm leading-5 text-red-800">{formError}</p>
              {passwordFailedSuggestOtp && (
                <button
                  type="button"
                  onClick={() => {
                    setPasswordFailedSuggestOtp(false);
                    resetPhoneOtpFlow();
                    resetEmailOtpFlow();
                    setMethod("email");
                    setEmailMode("otp");
                    setFormError(null);
                  }}
                  className="mt-1.5 inline-block text-xs font-semibold text-primary underline hover:no-underline"
                >
                  No password? Sign in with an email code instead →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Live region: success/info (e.g. code sent) */}
        {infoBanner && !formError && (
          <div
            className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 mb-4"
            role="status"
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden />
            <p className="flex-1 text-sm leading-5 text-emerald-800">{infoBanner}</p>
          </div>
        )}

        {/* Method segmented control — hidden while entering a code (mobile pattern) */}
        {phoneEnabled && emailEnabled && !inOtpStep && (
          <div
            className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1"
            role="tablist"
            aria-label="Sign-in method"
          >
            <button
              type="button"
              role="tab"
              aria-selected={method === "phone"}
              onClick={() => switchMethod("phone")}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all ${
                method === "phone"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Smartphone className="h-4 w-4" aria-hidden />
              Phone
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={method === "email"}
              onClick={() => switchMethod("email")}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all ${
                method === "email"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Mail className="h-4 w-4" aria-hidden />
              {t("auth.email")}
            </button>
          </div>
        )}

        {!phoneEnabled && !emailEnabled && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 mb-4 text-sm text-amber-800" role="alert">
            Phone and email sign-in are currently unavailable.
            {hasSocialAuth ? " Use Google or Apple below." : " Please try again later or contact support."}
          </div>
        )}

        {/* ── Phone: enter number ── */}
        {phoneEnabled && method === "phone" && !otpSent && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handlePhoneSendOtp();
            }}
          >
            <div>
              <Label className="text-xs font-medium text-gray-700 mb-1.5 block" htmlFor="login-phone">
                {t("auth.phone")}
              </Label>
              <PhoneInput
                inputId="login-phone"
                label=""
                value={phoneFull}
                onChange={(v) => {
                  setPhoneFull(v);
                  if (phoneInputError) setPhoneInputError(null);
                }}
                defaultCountryCode="+27"
                placeholder="e.g. 82 123 4567"
              />
              {phoneInputError && (
                <p className="mt-1.5 text-xs text-red-600" role="alert">{phoneInputError}</p>
              )}
            </div>
            {captchaRequired ? <AuthTurnstile onToken={setCaptchaToken} /> : null}
            <Button type="submit" disabled={loading} aria-busy={loading} className={primaryCtaClasses}>
              {loading ? (
                <span className="flex items-center gap-2">{spinner} Sending code…</span>
              ) : (
                "Continue"
              )}
            </Button>
            <p className="text-xs leading-5 text-gray-400">
              We&apos;ll text a {publicAuth.sms_otp_length}-digit code (valid about {smsExpiryMin}{" "}
              {smsExpiryMin === 1 ? "minute" : "minutes"}). Standard rates apply.
            </p>
          </form>
        )}

        {/* ── Phone: verify code ── */}
        {phoneEnabled && method === "phone" && otpSent && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  resetPhoneOtpFlow();
                  setFormError(null);
                }}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Back to phone number"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </button>
              <p className="text-sm text-gray-600">
                Enter the {publicAuth.sms_otp_length}-digit code sent to{" "}
                <span className="font-semibold text-gray-900">{sentPhoneE164}</span>
              </p>
            </div>
            <OtpDigitInput
              value={otpCode}
              onChange={setOtpCode}
              onComplete={(code) => {
                if (!loading && isCompleteOtpForLength(code, publicAuth.sms_otp_length)) void handleVerifyPhoneOtp(code);
              }}
              disabled={loading}
              autoFocus
              label="Phone verification code"
              length={publicAuth.sms_otp_length}
            />
            <div className="flex items-center justify-between gap-3 text-xs">
              {otpSecondsLeft > 0 ? (
                <span className="text-gray-500">
                  Code expires in{" "}
                  <span className={`font-semibold tabular-nums ${otpSecondsLeft <= 15 ? "text-amber-600" : "text-gray-700"}`}>
                    {formatOtpCountdown(otpSecondsLeft)}
                  </span>
                </span>
              ) : (
                <span className="font-medium text-amber-600">Code expired — request a new one.</span>
              )}
              <button
                type="button"
                onClick={() => void handleResendPhoneOtp()}
                disabled={otpResending || loading || otpResendCooldown > 0}
                className="font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {otpResending
                  ? "Resending…"
                  : otpResendCooldown > 0
                    ? `Resend in ${otpResendCooldown}s`
                    : "Resend code"}
              </button>
            </div>
            <Button
              type="button"
              disabled={loading || !isCompleteOtpForLength(otpCode, publicAuth.sms_otp_length)}
              aria-busy={loading}
              onClick={() => void handleVerifyPhoneOtp()}
              className={primaryCtaClasses}
            >
              {loading ? (
                <span className="flex items-center gap-2">{spinner} Verifying…</span>
              ) : (
                "Verify & continue"
              )}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-gray-500 hover:text-gray-700"
              onClick={() => {
                resetPhoneOtpFlow();
                setFormError(null);
              }}
            >
              Use a different number
            </button>
          </div>
        )}

        {/* ── Email: passwordless code (default) ── */}
        {emailEnabled && method === "email" && emailMode === "otp" && !emailOtpSent && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleEmailSendOtp();
            }}
          >
            <div>
              <Label htmlFor="login-email-otp" className="text-xs font-medium text-gray-700 mb-1.5 block">
                {t("auth.email")}
              </Label>
              <div className="flex items-center rounded-xl border border-gray-200 bg-gray-100 px-3.5 gap-2.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
                <Mail className="h-[18px] w-[18px] text-gray-400 flex-shrink-0" aria-hidden />
                <Input
                  id="login-email-otp"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailInputError) setEmailInputError(null);
                  }}
                  className="flex-1 border-0 bg-transparent h-12 px-2.5 text-[15px] text-gray-700 placeholder:text-gray-400 focus-visible:ring-0"
                  autoComplete="email"
                  inputMode="email"
                  aria-required="true"
                />
              </div>
              {emailInputError ? (
                <p className="mt-1.5 text-xs text-red-600" role="alert">{emailInputError}</p>
              ) : (
                <p className="mt-2 text-xs leading-5 text-gray-400">
                  We&apos;ll email you a {publicAuth.email_otp_length}-digit verification code (valid about{" "}
                  {emailExpiryMin} {emailExpiryMin === 1 ? "minute" : "minutes"}). No password needed.
                </p>
              )}
            </div>
            <Button type="submit" disabled={loading} aria-busy={loading} className={primaryCtaClasses}>
              {loading ? (
                <span className="flex items-center gap-2">{spinner} Sending code…</span>
              ) : (
                "Send code"
              )}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
              onClick={() => {
                setEmailMode("password");
                setFormError(null);
              }}
            >
              Use <span className="font-semibold text-primary">password</span> instead
            </button>
          </form>
        )}

        {/* ── Email: verify code ── */}
        {emailEnabled && method === "email" && emailMode === "otp" && emailOtpSent && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  resetEmailOtpFlow();
                  setFormError(null);
                }}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Back to email"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </button>
              <p className="text-sm text-gray-600">
                Enter the {publicAuth.email_otp_length}-digit code sent to{" "}
                <span className="font-semibold text-gray-900">{sentEmailForOtp}</span>
              </p>
            </div>
            <OtpDigitInput
              value={emailOtpCode}
              onChange={setEmailOtpCode}
              onComplete={(code) => {
                if (!loading && isCompleteOtpForLength(code, publicAuth.email_otp_length)) void handleVerifyEmailOtp(code);
              }}
              disabled={loading}
              autoFocus
              label="Email verification code"
              length={publicAuth.email_otp_length}
            />
            <div className="flex items-center justify-between gap-3 text-xs">
              {emailOtpSecondsLeft > 0 ? (
                <span className="text-gray-500">
                  Code valid for{" "}
                  <span className="font-semibold tabular-nums text-gray-700">
                    {formatOtpCountdown(emailOtpSecondsLeft)}
                  </span>
                </span>
              ) : (
                <span className="font-medium text-amber-600">Code expired — request a new one.</span>
              )}
              <button
                type="button"
                onClick={() => void handleResendEmailOtp()}
                disabled={emailOtpResending || loading || emailOtpResendCooldown > 0}
                className="font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {emailOtpResending
                  ? "Resending…"
                  : emailOtpResendCooldown > 0
                    ? `Resend in ${emailOtpResendCooldown}s`
                    : "Resend code"}
              </button>
            </div>
            <Button
              type="button"
              disabled={loading || !isCompleteOtpForLength(emailOtpCode, publicAuth.email_otp_length)}
              aria-busy={loading}
              onClick={() => void handleVerifyEmailOtp()}
              className={primaryCtaClasses}
            >
              {loading ? (
                <span className="flex items-center gap-2">{spinner} Verifying…</span>
              ) : (
                "Verify & continue"
              )}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-gray-500 hover:text-gray-700"
              onClick={() => {
                resetEmailOtpFlow();
                setFormError(null);
              }}
            >
              Use a different email
            </button>
          </div>
        )}

        {/* ── Email: password (progressive disclosure) ── */}
        {emailEnabled && method === "email" && emailMode === "password" && (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <Label htmlFor="login-email" className="text-xs font-medium text-gray-700 mb-1.5 block">
                {t("auth.email")}
              </Label>
              <div className="flex items-center rounded-xl border border-gray-200 bg-gray-100 px-3.5 gap-2.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
                <Mail className="h-[18px] w-[18px] text-gray-400 flex-shrink-0" aria-hidden />
                <Input
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 border-0 bg-transparent h-12 px-2.5 text-[15px] text-gray-700 placeholder:text-gray-400 focus-visible:ring-0"
                  autoComplete="email"
                  inputMode="email"
                  onKeyDown={(e) => e.key === "Enter" && passwordRef.current?.focus()}
                  aria-required="true"
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="login-password" className="text-xs font-medium text-gray-700 block">
                  {t("auth.password")}
                </Label>
                <Link
                  href={nextUrl ? `/forgot-password?next=${encodeURIComponent(nextUrl)}` : "/forgot-password"}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  {t("auth.forgotPassword")}
                </Link>
              </div>
              <div className="flex items-center rounded-xl border border-gray-200 bg-gray-100 px-3.5 gap-2.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
                <Lock className="h-[18px] w-[18px] text-gray-400 flex-shrink-0" aria-hidden />
                <Input
                  ref={passwordRef}
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={trackPasswordCapsLock}
                  onKeyUp={trackPasswordCapsLock}
                  onBlur={() => setCapsLockOn(false)}
                  className="flex-1 border-0 bg-transparent h-12 px-2.5 pr-8 text-[15px] text-gray-700 placeholder:text-gray-400 focus-visible:ring-0"
                  autoComplete="current-password"
                  aria-required="true"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="p-1 rounded text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
                </button>
              </div>
              {capsLockOn && (
                <p className="mt-1.5 text-xs font-medium text-amber-600" role="status">
                  Caps Lock is on.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="login-remember-me"
                checked={rememberMe}
                onCheckedChange={(c) => setRememberMe(c === true)}
              />
              <label htmlFor="login-remember-me" className="text-xs text-gray-600 cursor-pointer">
                {t("auth.rememberMe")}
              </label>
            </div>
            {captchaRequired ? <AuthTurnstile onToken={setCaptchaToken} /> : null}
            <Button type="submit" disabled={loading} aria-busy={loading} className={primaryCtaClasses} data-testid="login-submit">
              {loading ? (
                <span className="flex items-center gap-2">{spinner} Signing in…</span>
              ) : (
                t("auth.login")
              )}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
              onClick={() => {
                setEmailMode("otp");
                setFormError(null);
                setPasswordFailedSuggestOtp(false);
              }}
            >
              Sign in with an <span className="font-semibold text-primary">email code</span> instead
            </button>
          </form>
        )}

        {/* ── Social auth ── */}
        {hasSocialAuth && !inOtpStep && (
          <>
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-gray-200" aria-hidden />
              <span className="text-[13px] text-gray-400">{t("auth.orContinueWith")}</span>
              <div className="flex-1 h-px bg-gray-200" aria-hidden />
            </div>
            <div className="space-y-3">
              {socialAuth.google && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleSocialOAuth("google")}
                  disabled={loading}
                  className="w-full h-12 rounded-xl border-gray-200 justify-center gap-2.5 hover:bg-gray-50"
                >
                  <FaGoogle className="text-lg text-[#4285F4]" aria-hidden />
                  <span>{t("auth.continueWithGoogle")}</span>
                </Button>
              )}
              {socialAuth.apple && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleSocialOAuth("apple")}
                  disabled={loading}
                  className="w-full h-12 rounded-xl border-gray-200 justify-center gap-2.5 hover:bg-gray-50"
                >
                  <FaApple className="text-lg" aria-hidden />
                  <span>{t("auth.continueWithApple")}</span>
                </Button>
              )}
              <PasskeyComingSoonButton />
            </div>
          </>
        )}

        {/* ── Signup + legal footer ── */}
        {!inOtpStep && (
          <>
            <p className="text-center text-sm text-gray-500 mt-6">
              {t("auth.dontHaveAccount")}{" "}
              <Link
                href={nextUrl ? `/signup?next=${encodeURIComponent(nextUrl)}` : "/signup"}
                className="font-bold text-primary hover:underline"
              >
                {t("auth.signup")}
              </Link>
            </p>
            <p className="text-center text-xs leading-5 text-gray-400 mt-4">
              By continuing, you agree to our{" "}
              <Link href="/terms-and-condition" className="font-medium text-gray-500 underline hover:text-gray-700">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy-policy" className="font-medium text-gray-500 underline hover:text-gray-700">
                Privacy Policy
              </Link>
              .
            </p>
          </>
        )}
      </main>
    </div>
  );
}
