"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "@beautonomi/i18n";
import { Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { FaGoogle, FaApple, FaFacebook } from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { OtpDigitInput } from "@/components/ui/otp-digit-input";
import { useAuth } from "@/providers/AuthProvider";
import { signIn as signInAuth, signInWithOAuth } from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  SUPABASE_AUTH_OTP_LENGTH,
  SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS,
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
} from "@/lib/supabase/auth-sms-otp";
import { toast } from "sonner";
import logo from "../../../public/images/logo.svg";
import type { UserRole } from "@/types/beautonomi";
import { isCustomerSkewedPostLoginPath } from "@/lib/auth/post-login-return-path";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const { refreshUser, role: contextRole } = useAuth();
  const nextUrl = searchParams.get("next") || searchParams.get("redirect") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [phoneFull, setPhoneFull] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [sentPhoneE164, setSentPhoneE164] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [otpResending, setOtpResending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const getRedirectUrl = () => {
    if (typeof window === "undefined") return "/auth/callback";
    const base = window.location.origin;
    const next = nextUrl && nextUrl.startsWith("/") ? nextUrl : "/";
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
    const next = nextUrl && nextUrl.startsWith("/") ? nextUrl : null;
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
    if (finalRole === "provider_onboarding") {
      router.replace("/provider/get-started");
      return;
    }
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

  const routeAfterAuth = async (loginResult?: any) => {
    if (nextUrl.startsWith("/provider")) {
      toast.success("Logged in successfully!");
      router.replace("/provider/dashboard");
      void refreshUser().catch(() => {});
      return;
    }
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
    const looksValid = normalizedPhone.startsWith("+") && normalizedPhone.length >= 11;
    if (!looksValid) {
      setFormError("Please enter a valid phone number with country code.");
      return;
    }
    setLoading(true);
    setFormError(null);
    try {
      const supabase = getSupabaseClient();
      const phone = normalizeSupabaseAuthPhone(normalizedPhone);
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: { channel: "sms", shouldCreateUser: false },
      });
      if (error) throw error;
      setSentPhoneE164(phone);
      setOtpSent(true);
      setOtpCode("");
      setOtpExpiresAt(Date.now() + SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS * 1000);
      toast.success("Check your phone for the verification code");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send OTP";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (codeOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(codeOverride ?? otpCode);
    if (!sentPhoneE164 || !isCompleteSupabaseSmsOtp(token)) return;
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

  const handleResendPhoneOtp = async () => {
    if (!sentPhoneE164) return;
    setOtpResending(true);
    setFormError(null);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalizeSupabaseAuthPhone(sentPhoneE164),
        options: { channel: "sms", shouldCreateUser: false },
      });
      if (error) throw error;
      setOtpCode("");
      setOtpExpiresAt(Date.now() + SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS * 1000);
      toast.success("A new verification code has been sent");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend code";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setOtpResending(false);
    }
  };

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
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
      const loginResult = await signInAuth({ email: trimmedEmail, password });
      setFormError(null);
      await routeAfterAuth(loginResult);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed. Please try again.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple" | "facebook") {
    setFormError(null);
    setLoading(true);
    try {
      await signInWithOAuth(provider, getRedirectUrl());
      toast.info(`Redirecting to ${provider}…`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Sign in with ${provider} failed.`;
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
          {t("auth.login")}
        </h1>
        <p className="text-center text-[14px] text-gray-500 mb-7">
          Welcome back to Beautonomi
        </p>

        {formError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 mb-4" role="alert">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{formError}</p>
          </div>
        )}

        {!showEmailLogin && !otpSent && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium text-gray-700 mb-1.5 block">
                Phone number
              </Label>
              <PhoneInput
                inputId="login-phone"
                label=""
                value={phoneFull}
                onChange={setPhoneFull}
                defaultCountryCode="+27"
                placeholder="e.g. 82 123 4567"
              />
              <p className="mt-2 text-xs text-gray-500">
                We&apos;ll send a {SUPABASE_AUTH_OTP_LENGTH}-digit code via SMS.
              </p>
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
                "Continue with OTP"
              )}
            </Button>
          </div>
        )}

        {!showEmailLogin && otpSent && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Enter the {SUPABASE_AUTH_OTP_LENGTH}-digit code sent to{" "}
              <span className="font-semibold text-gray-900">{sentPhoneE164}</span>
            </p>
            <OtpDigitInput
              value={otpCode}
              onChange={setOtpCode}
              onComplete={(code) => {
                if (!loading && isCompleteSupabaseSmsOtp(code)) void handleVerifyPhoneOtp(code);
              }}
              disabled={loading}
              autoFocus
              label="Phone verification code"
              length={SUPABASE_AUTH_OTP_LENGTH}
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
                disabled={otpResending || loading}
                className="font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {otpResending ? "Resending..." : "Resend code"}
              </button>
            </div>
            <Button
              type="button"
              disabled={loading || !isCompleteSupabaseSmsOtp(otpCode)}
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
                setOtpSent(false);
                setOtpCode("");
                setSentPhoneE164("");
                setOtpExpiresAt(null);
                setFormError(null);
              }}
            >
              Use a different number
            </button>
          </div>
        )}

        {showEmailLogin && (
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
            onClick={() => handleOAuth("google")}
            disabled={loading}
            className="w-full h-12 rounded-xl border-gray-200 justify-center gap-2.5"
          >
            <FaGoogle className="text-lg text-[#4285F4]" aria-hidden />
            <span>{t("auth.continueWithGoogle")}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOAuth("apple")}
            disabled={loading}
            className="w-full h-12 rounded-xl border-gray-200 justify-center gap-2.5"
          >
            <FaApple className="text-lg" aria-hidden />
            <span>{t("auth.continueWithApple")}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowEmailLogin((v) => !v)}
            className="w-full h-12 rounded-xl border-gray-200 justify-center gap-2.5"
          >
            <Mail className="h-4 w-4" aria-hidden />
            <span>{showEmailLogin ? "Back to phone OTP" : "Continue with Email & Password"}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOAuth("facebook")}
            disabled={loading}
            className="w-full h-12 rounded-xl border-gray-200 justify-center gap-2.5"
          >
            <FaFacebook className="text-lg text-[#1877F2]" aria-hidden />
            <span>{t("auth.continueWithFacebook") ?? "Continue with Facebook"}</span>
          </Button>
        </div>
        <p className="text-center text-sm text-gray-500 mt-6">
          {t("auth.dontHaveAccount")}{" "}
          <Link
            href={nextUrl ? `/signup?next=${encodeURIComponent(nextUrl)}` : "/signup"}
            className="font-bold text-primary"
          >
            {t("auth.signup")}
          </Link>
        </p>
      </div>
    </div>
  );
}
