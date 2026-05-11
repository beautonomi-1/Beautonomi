"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "@beautonomi/i18n";
import { Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/supabase/auth";
import { toast } from "sonner";
import logo from "../../../public/images/logo.svg";

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const nextUrl = searchParams.get("next") || "";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await resetPassword(trimmed);
      setSent(true);
      toast.success("Check your email for the reset link.");
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const loginHref = nextUrl ? `/login?next=${encodeURIComponent(nextUrl)}` : "/login";

  if (sent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-12">
        <div className="w-full max-w-[420px]">
          <Link href="/" className="inline-block mb-8" aria-label="Beautonomi home">
            <Image src={logo} alt="Beautonomi" className="h-8 w-auto" />
          </Link>
          <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-green-800 mb-2">Check your email</h2>
            <p className="text-sm text-green-700 mb-6">
              We sent a password reset link to <strong>{email.trim()}</strong>. Open the link in your browser to set a new password.
            </p>
            <Link href={loginHref}>
              <Button className="w-full bg-[#FF0077] hover:bg-[#E6006A] text-white rounded-xl h-12">
                Back to login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="inline-block mb-8" aria-label="Beautonomi home">
          <Image src={logo} alt="Beautonomi" className="h-8 w-auto" />
        </Link>
        <div className="rounded-2xl p-6 mb-2 bg-[rgba(255,0,119,0.06)]">
          <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center bg-white/90">
            <span className="text-2xl text-[#FF0077]" aria-hidden>◆</span>
          </div>
        </div>
        <h1 className="text-center text-[28px] font-extrabold text-gray-900 mb-1" id="forgot-heading">
          {t("auth.resetPassword")}
        </h1>
        <p className="text-center text-[15px] text-gray-500 mb-2">
          Enter the email for your account and we&apos;ll send you a link to reset your password.
        </p>
        <p className="text-center text-[13px] text-gray-500 mb-7">
          Signed up with phone, email code, or Google? You don&apos;t have a password —{" "}
          <Link href={loginHref} className="font-semibold text-[#FF0077] hover:underline">
            sign in with one of those instead
          </Link>
          .
        </p>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 mb-4" role="alert">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="forgot-email" className="text-[13px] font-semibold text-gray-700 mb-1.5 block">
              {t("auth.email")}
            </Label>
            <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50/80 px-3.5 gap-2.5">
              <Mail className="h-[18px] w-[18px] text-gray-400 flex-shrink-0" aria-hidden />
              <Input
                id="forgot-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 border-0 bg-transparent h-12 px-2.5 focus-visible:ring-0"
                autoComplete="email"
                inputMode="email"
                aria-required="true"
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl text-base font-bold bg-[#FF0077] hover:bg-[#E6006A] text-white"
          >
            {loading ? (
              <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden />
            ) : (
              "Send reset link"
            )}
          </Button>
          <Link href={loginHref} className="block text-center text-sm text-gray-500 hover:text-[#FF0077] mt-4">
            Back to login
          </Link>
        </form>
      </div>
    </div>
  );
}
