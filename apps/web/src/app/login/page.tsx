"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "@beautonomi/i18n";
import { Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { FaApple, FaGoogle } from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { OtpDigitInput } from "@/components/ui/otp-digit-input";
import { useAuth } from "@/providers/AuthProvider";
import { signInWithOAuth, sendEmailSignInOtp } from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
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
  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const { refreshUser, role: contextRole, signIn: signInWithSession } = useAuth();
  const rawNext = searchParams.get("next") || searchParams.get("redirect") || "";
  const nextUrl = sanitizeRelativeRedirect(rawNext) ?? "";
  const initialAuthError = searchParams.get("error")?.trim() || null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  /** Primary path: phone OTP, email OTP (code), or legacy email+password. */
  const [primaryLogin, setPrimaryLogin] = useState<"phone" | "email_otp" | "email_password">("phone");
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
  const [phoneInputError, setPhoneInputError] = useState<string | null>(null);
  const [emailInputError, setEmailInputError] = useState<string | null>(null);
  const [passwordFailedSuggestOtp, setPasswordFailedSuggestOtp] = useState(false);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [emailOtpResendCooldown, setEmailOtpResendCooldown] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [publicAuth, setPublicAuth] = useState<PublicAuthPolicy>(DEFAULT_PUBLIC_AUTH);

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

  const routeAfterAuth = async (loginResult?: any) => {
    let userRole =
      (await resolveRoleFast()) ||
      (loginResult?.user?.user_metadata?.role as UserRole | undefined) ||
      contextRole;
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
    try {
      const supabase = getSupabaseClient();
      const phone = normalizeSupabaseAuthPhone(normalizedPhone);
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: { channel: "sms", shouldCreateUser: true },
      });
      if (error) throw error;
      setSentPhoneE164(phone);
      setOtpSent(true);
      setOtpCode("");
      setOtpExpiresAt(Date.now() + publicAuth.sms_otp_expiration_seconds * 1000);
      setOtpResendCooldown(SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS);
      toast.success("Check your phone for the verification code");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send OTP";
      setFormError(friendlyAuthErrorMessage(msg, "phone"));
      toast.error(friendlyAuthErrorMessage(msg, "phone"));
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
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({
        phone: sentPhoneE164,
        token,
        type: "sms",
      });
      if (error) throw error;
      await routeAfterAuth();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid code";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const resetPhoneOtpFlow = () => {
    setOtpSent(false);
    setOtpCode("");
    setSentPhoneE164("");
    setOtpExpiresAt(null);
  };

  const resetEmailOtpFlow = () => {
    setEmailOtpSent(false);
    setEmailOtpCode("");
    setSentEmailForOtp("");
    setEmailOtpExpiresAt(null);
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
    try {
      const { error } = await sendEmailSignInOtp(trimmedEmail);
      if (error) throw error;
      setSentEmailForOtp(trimmedEmail);
      setEmailOtpSent(true);
      setEmailOtpCode("");
      setEmailOtpExpiresAt(Date.now() + publicAuth.email_otp_expiration_seconds * 1000);
      setEmailOtpResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
      toast.success("Check your email for the verification code");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send email code";
      setFormError(friendlyAuthErrorMessage(msg, "email"));
      toast.error(friendlyAuthErrorMessage(msg, "email"));
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
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({
        email: sentEmailForOtp,
        token,
        type: "email",
      });
      if (error) throw error;
      await routeAfterAuth();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid code";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmailOtp = async () => {
    if (!sentEmailForOtp || emailOtpResendCooldown > 0) return;
    setEmailOtpResending(true);
    setFormError(null);
    try {
      const { error } = await sendEmailSignInOtp(sentEmailForOtp);
      if (error) throw error;
      setEmailOtpCode("");
      setEmailOtpExpiresAt(Date.now() + publicAuth.email_otp_expiration_seconds * 1000);
      setEmailOtpResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
      toast.success("A new verification code has been sent");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend code";
      setFormError(friendlyAuthErrorMessage(msg, "email"));
      toast.error(friendlyAuthErrorMessage(msg, "email"));
    } finally {
      setEmailOtpResending(false);
    }
  };

  const handleResendPhoneOtp = async () => {
    if (!sentPhoneE164 || otpResendCooldown > 0) return;
    setOtpResending(true);
    setFormError(null);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalizeSupabaseAuthPhone(sentPhoneE164),
        options: { channel: "sms", shouldCreateUser: true },
      });
      if (error) throw error;
      setOtpCode("");
      setOtpExpiresAt(Date.now() + publicAuth.sms_otp_expiration_seconds * 1000);
      setOtpResendCooldown(SUPABASE_SMS_OTP_RESEND_COOLDOWN_SECONDS);
      toast.success("A new verification code has been sent");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend code";
      setFormError(friendlyAuthErrorMessage(msg, "phone"));
      toast.error(friendlyAuthErrorMessage(msg, "phone"));
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
      await signInWithSession(trimmedEmail, password);
      setFormError(null);
      await routeAfterAuth();
    } catch (err: unknown) {
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
      toast.error(msg);
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
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="inline-block mb-8" aria-label="Beautonomi home">
          <Image src={logo} alt="Beautonomi" className="h-8 w-auto" />
        </Link>
        <div className="rounded-2xl p-6 mb-2 bg-[rgba(255,0,119,0.06)]">
          <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-2 bg-white/90">
            <span className="text-2xl text-primary" aria-hidden>◆</span>
          </div>
        </div>
        <h1 className="text-center text-[28px] font-extrabold text-gray-900 mb-1" id="login-heading">
          Welcome
        </h1>
        <p className="text-center text-[14px] text-gray-500 mb-7">
          Sign in or create an account — phone, email code, social, or password.
        </p>

        <p className="mb-4 text-center text-xs text-gray-500">
          Continue with phone, email code, Google, Apple, or password.
        </p>

        {formError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 mb-4" role="alert">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-800">{formError}</p>
              {passwordFailedSuggestOtp && (
                <button
                  type="button"
                  onClick={() => {
                    setPasswordFailedSuggestOtp(false);
                    resetPhoneOtpFlow();
                    resetEmailOtpFlow();
                    setPrimaryLogin("email_otp");
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

        {primaryLogin === "phone" && !otpSent && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium text-gray-700 mb-1.5 block">
                Phone number
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
              {phoneInputError ? (
                <p className="mt-1.5 text-xs text-red-600" role="alert">{phoneInputError}</p>
              ) : (
                <p className="mt-2 text-xs text-gray-500">
                  We&apos;ll send a {publicAuth.sms_otp_length}-digit code via SMS.
                </p>
              )}
            </div>
            <Button
              type="button"
              disabled={loading}
              onClick={() => void handlePhoneSendOtp()}
              className="w-full h-12 rounded-xl text-base font-bold bg-primary hover:bg-primary-hover text-white"
            >
              {loading ? (
                <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden />
              ) : (
                "Continue with phone"
              )}
            </Button>
          </div>
        )}

        {primaryLogin === "phone" && otpSent && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Enter the {publicAuth.sms_otp_length}-digit code sent to{" "}
              <span className="font-semibold text-gray-900">{sentPhoneE164}</span>
            </p>
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
              <span className="text-gray-500">
                Code expires in{" "}
                <span className="font-semibold text-gray-700">
                  {formatOtpCountdown(otpSecondsLeft)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void handleResendPhoneOtp()}
                disabled={otpResending || loading || otpResendCooldown > 0}
                className="font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {otpResending
                  ? "Resending..."
                  : otpResendCooldown > 0
                    ? `Resend in ${otpResendCooldown}s`
                    : "Resend code"}
              </button>
            </div>
            <Button
              type="button"
              disabled={loading || !isCompleteOtpForLength(otpCode, publicAuth.sms_otp_length)}
              onClick={() => void handleVerifyPhoneOtp()}
              className="w-full h-12 rounded-xl text-base font-bold bg-primary hover:bg-primary-hover text-white"
            >
              {loading ? (
                <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden />
              ) : (
                "Verify & Continue"
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

        {primaryLogin === "email_otp" && !emailOtpSent && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="login-email-otp" className="text-xs font-medium text-gray-700 mb-1.5 block">
                Email
              </Label>
              <div className="flex items-center rounded-xl border border-gray-200 bg-gray-100 px-3.5 gap-2.5">
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
                  className="flex-1 border-0 bg-transparent h-12 px-2.5 text-[13px] text-gray-700 placeholder:text-gray-400 focus-visible:ring-0"
                  autoComplete="email"
                  inputMode="email"
                  aria-required="true"
                />
              </div>
              {emailInputError ? (
                <p className="mt-1.5 text-xs text-red-600" role="alert">{emailInputError}</p>
              ) : (
                <p className="mt-2 text-xs text-gray-500">
                  We&apos;ll email a {publicAuth.email_otp_length}-digit code. If the message only has a sign-in link,
                  add the <code className="text-[11px] bg-gray-100 px-1 rounded">{"{{ .Token }}"}</code> placeholder to
                  the Supabase Magic Link email template (see{" "}
                  <code className="text-[11px]">supabase/email-templates/README.md</code>).
                </p>
              )}
            </div>
            <Button
              type="button"
              disabled={loading}
              onClick={() => void handleEmailSendOtp()}
              className="w-full h-12 rounded-xl text-base font-bold bg-primary hover:bg-primary-hover text-white"
            >
              {loading ? (
                <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden />
              ) : (
                "Send email code"
              )}
            </Button>
          </div>
        )}

        {primaryLogin === "email_otp" && emailOtpSent && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Enter the {publicAuth.email_otp_length}-digit code sent to{" "}
              <span className="font-semibold text-gray-900">{sentEmailForOtp}</span>
            </p>
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
              <span className="text-gray-500">
                Code valid for{" "}
                <span className="font-semibold text-gray-700">
                  {formatOtpCountdown(emailOtpSecondsLeft)}
                </span>{" "}
                (from platform auth settings; match Supabase &quot;Email OTP expiration&quot;)
              </span>
              <button
                type="button"
                onClick={() => void handleResendEmailOtp()}
                disabled={emailOtpResending || loading || emailOtpResendCooldown > 0}
                className="font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {emailOtpResending
                  ? "Resending..."
                  : emailOtpResendCooldown > 0
                    ? `Resend in ${emailOtpResendCooldown}s (spacing only)`
                    : "Resend code"}
              </button>
            </div>
            <Button
              type="button"
              disabled={loading || !isCompleteOtpForLength(emailOtpCode, publicAuth.email_otp_length)}
              onClick={() => void handleVerifyEmailOtp()}
              className="w-full h-12 rounded-xl text-base font-bold bg-primary hover:bg-primary-hover text-white"
            >
              {loading ? (
                <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden />
              ) : (
                "Verify & Continue"
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

        {primaryLogin === "email_password" && (
          <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <Label htmlFor="login-email" className="text-xs font-medium text-gray-700 mb-1.5 block">
              {t("auth.email")}
            </Label>
            <div className="flex items-center rounded-xl border border-gray-200 bg-gray-100 px-3.5 gap-2.5">
              <Mail className="h-[18px] w-[18px] text-gray-400 flex-shrink-0" aria-hidden />
              <Input
                id="login-email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 border-0 bg-transparent h-12 px-2.5 text-[13px] text-gray-700 placeholder:text-gray-400 focus-visible:ring-0"
                autoComplete="email"
                inputMode="email"
                onKeyDown={(e) => e.key === "Enter" && passwordRef.current?.focus()}
                aria-required="true"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="login-password" className="text-xs font-medium text-gray-700 mb-1.5 block">
              {t("auth.password")}
            </Label>
            <div className="flex items-center rounded-xl border border-gray-200 bg-gray-100 px-3.5 gap-2.5">
              <Lock className="h-[18px] w-[18px] text-gray-400 flex-shrink-0" aria-hidden />
              <Input
                ref={passwordRef}
                id="login-password"
                type={showPassword ? "text" : "password"}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 border-0 bg-transparent h-12 px-2.5 pr-8 text-[13px] text-gray-700 placeholder:text-gray-400 focus-visible:ring-0"
                autoComplete="current-password"
                aria-required="true"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="p-1 rounded text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <Link
            href={nextUrl ? `/forgot-password?next=${encodeURIComponent(nextUrl)}` : "/forgot-password"}
            className="block text-sm text-gray-500 hover:text-primary text-center mt-1"
          >
            {t("auth.forgotPassword")} <span className="font-semibold text-primary">Reset it</span>
          </Link>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl text-base font-bold bg-primary hover:bg-primary-hover text-white"
          >
            {loading ? (
              <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden />
            ) : (
              t("auth.login")
            )}
          </Button>
          </form>
        )}

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-gray-200" aria-hidden />
          <span className="text-[13px] text-gray-400">{t("auth.orContinueWith")}</span>
          <div className="flex-1 h-px bg-gray-200" aria-hidden />
        </div>
        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleSocialOAuth("google")}
            disabled={loading}
            className="w-full h-12 rounded-xl border-gray-200 justify-center gap-2.5"
          >
            <FaGoogle className="text-lg text-[#4285F4]" aria-hidden />
            <span>{t("auth.continueWithGoogle")}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleSocialOAuth("apple")}
            disabled={loading}
            className="w-full h-12 rounded-xl border-gray-200 justify-center gap-2.5"
          >
            <FaApple className="text-lg" aria-hidden />
            <span>{t("auth.continueWithApple")}</span>
          </Button>
          {primaryLogin !== "phone" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetEmailOtpFlow();
                setPrimaryLogin("phone");
                setFormError(null);
                setPasswordFailedSuggestOtp(false);
              }}
              className="w-full h-12 rounded-xl border-gray-200 justify-center gap-2.5"
            >
              <span>Continue with phone</span>
            </Button>
          )}
          {primaryLogin !== "email_otp" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetPhoneOtpFlow();
                resetEmailOtpFlow();
                setPrimaryLogin("email_otp");
                setFormError(null);
                setPasswordFailedSuggestOtp(false);
              }}
              className="w-full h-12 rounded-xl border-gray-200 justify-center gap-2.5"
            >
              <Mail className="h-4 w-4" aria-hidden />
              <span>Continue with email code</span>
            </Button>
          )}
          {primaryLogin !== "email_password" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetPhoneOtpFlow();
                resetEmailOtpFlow();
                setPrimaryLogin("email_password");
                setFormError(null);
                setPasswordFailedSuggestOtp(false);
              }}
              className="w-full h-12 rounded-xl border-gray-200 justify-center gap-2.5"
            >
              <Lock className="h-4 w-4" aria-hidden />
              <span>Sign in with password</span>
            </Button>
          )}
        </div>
        <p className="text-center text-sm text-gray-500 mt-6">
          New here? Use phone, email code, or Google — we&apos;ll create your account when you verify. Or{" "}
          <Link
            href={nextUrl ? `/signup?next=${encodeURIComponent(nextUrl)}` : "/signup"}
            className="font-bold text-primary"
          >
            {t("auth.signup")}
          </Link>
          {" "}for the full signup form.
        </p>
      </div>
    </div>
  );
}
