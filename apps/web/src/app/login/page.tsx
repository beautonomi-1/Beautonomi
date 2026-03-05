"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "@beautonomi/i18n";
import { Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { FaGoogle, FaApple } from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/providers/AuthProvider";
import { signIn as signInAuth, signInWithOAuth } from "@/lib/supabase/auth";
import { toast } from "sonner";
import logo from "../../../public/images/logo.svg";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const { refreshUser, role: contextRole } = useAuth();
  const nextUrl = searchParams.get("next") || searchParams.get("redirect") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const getRedirectUrl = () => {
    if (typeof window === "undefined") return "/auth/callback";
    const base = window.location.origin;
    const next = nextUrl && nextUrl.startsWith("/") ? nextUrl : "/";
    return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
  };

  const redirectByRole = (finalRole: string) => {
    const next = nextUrl && nextUrl.startsWith("/") ? nextUrl : null;
    if (next && next !== "/login" && !next.includes("signup")) {
      router.replace(next);
      return;
    }
    // Redirect by role immediately so provider/admin land in the right place (avoids /portal server session delay)
    if (finalRole === "provider_owner" || finalRole === "provider_staff") {
      router.replace("/provider/dashboard");
      return;
    }
    if (finalRole === "superadmin") {
      router.replace("/admin/dashboard");
      return;
    }
    if (finalRole === "customer") {
      router.replace("/bookings");
      return;
    }
    // Fallback: /portal routes by role server-side (e.g. provider_onboarding)
    router.replace("/portal");
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
      await signInAuth({ email: trimmedEmail, password });
      setFormError(null);
      let updatedUser = await refreshUser();
      let retries = 0;
      while (!updatedUser && retries < 2) {
        await new Promise((r) => setTimeout(r, 500));
        updatedUser = await refreshUser();
        retries++;
      }
      const userRole = updatedUser?.role ?? contextRole;
      if (userRole) {
        toast.success("Logged in successfully!");
        redirectByRole(userRole);
      } else {
        setFormError("Login successful, but unable to load profile. Please refresh.");
        setLoading(false);
      }
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : "Login failed. Please try again.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setFormError(null);
    setLoading(true);
    try {
      await signInWithOAuth(provider, getRedirectUrl());
      toast.info(`Redirecting to ${provider}…`);
    } catch (err: any) {
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
            <span className="text-2xl text-[#FF0077]" aria-hidden>◆</span>
          </div>
        </div>
        <h1 className="text-center text-[28px] font-extrabold text-gray-900 mb-1" id="login-heading">
          {t("auth.login")}
        </h1>
        <p className="text-center text-[15px] text-gray-500 mb-7">
          Welcome back to Beautonomi
        </p>

        {formError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 mb-4" role="alert">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{formError}</p>
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <Label htmlFor="login-email" className="text-[13px] font-semibold text-gray-700 mb-1.5 block">
              {t("auth.email")}
            </Label>
            <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50/80 px-3.5 gap-2.5">
              <Mail className="h-[18px] w-[18px] text-gray-400 flex-shrink-0" aria-hidden />
              <Input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 border-0 bg-transparent h-12 px-2.5 focus-visible:ring-0"
                autoComplete="email"
                inputMode="email"
                onKeyDown={(e) => e.key === "Enter" && passwordRef.current?.focus()}
                aria-required="true"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="login-password" className="text-[13px] font-semibold text-gray-700 mb-1.5 block">
              {t("auth.password")}
            </Label>
            <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50/80 px-3.5 gap-2.5">
              <Lock className="h-[18px] w-[18px] text-gray-400 flex-shrink-0" aria-hidden />
              <Input
                ref={passwordRef}
                id="login-password"
                type={showPassword ? "text" : "password"}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 border-0 bg-transparent h-12 px-2.5 focus-visible:ring-0 pr-8"
                autoComplete="current-password"
                aria-required="true"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="p-1 rounded text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#FF0077]/30"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <Link
            href={nextUrl ? `/forgot-password?next=${encodeURIComponent(nextUrl)}` : "/forgot-password"}
            className="block text-sm text-gray-500 hover:text-[#FF0077] text-center mt-1"
          >
            {t("auth.forgotPassword")} <span className="font-semibold text-[#FF0077]">Reset it</span>
          </Link>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl text-base font-bold bg-[#FF0077] hover:bg-[#E6006A] text-white"
          >
            {loading ? (
              <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden />
            ) : (
              t("auth.login")
            )}
          </Button>
        </form>

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
        </div>
        <p className="text-center text-sm text-gray-500 mt-6">
          {t("auth.dontHaveAccount")}{" "}
          <Link
            href={nextUrl ? `/signup?next=${encodeURIComponent(nextUrl)}` : "/signup"}
            className="font-bold text-[#FF0077]"
          >
            {t("auth.signup")}
          </Link>
        </p>
      </div>
    </div>
  );
}
