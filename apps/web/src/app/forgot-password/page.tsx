"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "@beautonomi/i18n";
import { Mail, AlertCircle, CheckCircle2, Loader2, MailCheck, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OtpDigitInput } from "@/components/ui/otp-digit-input";
import { NewPasswordFields } from "@/components/auth/NewPasswordFields";
import { resetPassword, updatePassword, verifyPasswordRecoveryOtp } from "@/lib/supabase/auth";
import { isCompleteOtpForLength } from "@/lib/supabase/auth-sms-otp";
import { isValidForgotPasswordEmail } from "@/lib/auth/forgot-password-href";
import { getNewPasswordIssue, type NewPasswordIssue } from "@/lib/auth/password-strength";
import { sanitizeRelativeRedirect } from "@/lib/auth/post-login-return-path";
import { DEFAULT_PUBLIC_AUTH } from "@/lib/config/auth-policy-public";
import { fetcher } from "@/lib/http/fetcher";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { toast } from "sonner";
import logo from "../../../public/images/logo.svg";

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const rp = (key: string, opts?: Record<string, unknown>) =>
    t(`web.accountSettings.loginAndSecurity.resetPassword.${key}`, opts);
  const safeNext = sanitizeRelativeRedirect(searchParams.get("next")) ?? "";

  const [email, setEmail] = useState("");
  const emailPrefilledFromQuery = useRef(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    if (emailPrefilledFromQuery.current) return;
    const raw = searchParams.get("email");
    if (isValidForgotPasswordEmail(raw)) {
      setEmail(raw!.trim());
      emailPrefilledFromQuery.current = true;
      if (searchParams.get("sent") === "1") setSent(true);
    }
  }, [searchParams]);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [codeVerified, setCodeVerified] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const { bundle: configBundle } = useConfigBundle();
  const policy = configBundle?.auth ?? DEFAULT_PUBLIC_AUTH;
  const codeLength = policy.email_otp_length;
  const doneHref = safeNext || "/";

  async function sendResetEmail(): Promise<boolean> {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email address.");
      return false;
    }
    setError(null);
    setLoading(true);
    try {
      await resetPassword(trimmed, safeNext || null);
      toast.success("Check your email for the reset code and link.");
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
      toast.error(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (await sendResetEmail()) setSent(true);
  }

  async function handleResend() {
    setCode("");
    setCodeError(null);
    await sendResetEmail();
  }

  function issueMessage(issue: NewPasswordIssue): string {
    if (issue === "minLength") return rp("minLength", { min: policy.minimum_password_length });
    if (issue === "policy") return rp("policyMix");
    return rp("passwordsMismatch");
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    if (!codeVerified && !isCompleteOtpForLength(code, codeLength)) {
      setCodeError(`Enter the ${codeLength}-digit code from the email.`);
      return;
    }
    const issue = getNewPasswordIssue(newPassword, confirmPassword, policy);
    if (issue) {
      setFormError(issueMessage(issue));
      return;
    }

    setSubmitting(true);
    if (!codeVerified) {
      try {
        await verifyPasswordRecoveryOtp(email, code);
        setCodeVerified(true);
        setCodeError(null);
      } catch (err: unknown) {
        setCodeError(err instanceof Error ? err.message : "That code didn't work. Check it and try again.");
        setCode("");
        setSubmitting(false);
        return;
      }
    }
    try {
      await updatePassword(newPassword);
      await fetcher.post("/api/me/password/changed", {}).catch(() => {});
      setDone(true);
      toast.success(t("web.accountSettings.loginAndSecurity.passwordUpdated"));
      window.setTimeout(() => window.location.assign(doneHref), 1500);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : t("web.accountSettings.loginAndSecurity.updatePasswordFailed"));
      setSubmitting(false);
    }
  }

  const loginHref = safeNext ? `/login?next=${encodeURIComponent(safeNext)}` : "/login";
  const fromAccountSettings = safeNext.startsWith("/account-settings");
  const backHref = fromAccountSettings ? safeNext : loginHref;
  const backLabel = fromAccountSettings ? "Back to settings" : "Back to login";

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-12">
        <div className="w-full max-w-[420px] text-center" role="status" aria-live="polite">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 className="h-9 w-9 text-green-600" aria-hidden />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-2">{rp("updatedTitle")}</h1>
          <p className="text-[15px] text-gray-500 mb-6">{rp("updatedBody")}</p>
          <Button
            type="button"
            onClick={() => window.location.assign(doneHref)}
            className="w-full h-12 rounded-xl text-base font-bold bg-[#FF0077] hover:bg-[#E6006A] text-white"
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }

  if (sent) {
    const codeReady = codeVerified || isCompleteOtpForLength(code, codeLength);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-12">
        <div className="w-full max-w-[420px]">
          <Link href="/" className="inline-block mb-8" aria-label="Beautonomi home">
            <Image src={logo} alt="Beautonomi" className="h-8 w-auto" />
          </Link>
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4">
            <MailCheck className="mt-0.5 h-6 w-6 flex-shrink-0 text-green-600" aria-hidden />
            <div>
              <h1 className="text-base font-semibold text-green-900">Check your email</h1>
              <p className="mt-0.5 text-sm text-green-800">
                We sent a {codeLength}-digit code and a reset link to <strong>{email.trim()}</strong>.
              </p>
            </div>
          </div>

          <form onSubmit={handleResetPassword} noValidate className="space-y-5">
            <div>
              <p className="mb-2 text-[13px] font-semibold text-gray-700">1. Enter the code</p>
              {codeVerified ? (
                <p className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3.5 py-3 text-sm font-medium text-green-800">
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> Code verified
                </p>
              ) : (
                <OtpDigitInput
                  length={codeLength}
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    if (codeError) setCodeError(null);
                  }}
                  onComplete={() => passwordInputRef.current?.focus()}
                  disabled={submitting}
                  autoFocus
                  label={`Enter the ${codeLength}-digit code`}
                />
              )}
              {codeError && (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-red-700" role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                  {codeError}
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 text-[13px] font-semibold text-gray-700">2. Choose a new password</p>
              <NewPasswordFields
                idPrefix="forgot"
                password={newPassword}
                onPasswordChange={(v) => {
                  setNewPassword(v);
                  if (formError) setFormError(null);
                }}
                confirm={confirmPassword}
                onConfirmChange={(v) => {
                  setConfirmPassword(v);
                  if (formError) setFormError(null);
                }}
                policy={policy}
                disabled={submitting}
                passwordInputRef={passwordInputRef}
              />
            </div>

            {formError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5" role="alert">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" aria-hidden />
                <p className="text-sm text-red-800">{formError}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting || !codeReady || !newPassword || !confirmPassword}
              aria-busy={submitting}
              className="w-full h-12 rounded-xl text-base font-bold bg-[#FF0077] hover:bg-[#E6006A] text-white gap-2"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
              {t("auth.resetPassword")}
            </Button>
          </form>

          <p className="mt-5 flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-[13px] text-gray-600">
            <Link2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden />
            Prefer the link? Open it from the email in this browser and it takes you to the same new-password form.
          </p>

          <div className="mt-5 flex items-center justify-between text-sm">
            {!codeVerified ? (
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={loading || submitting}
                className="font-medium text-[#FF0077] hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {loading ? "Sending…" : "Resend email"}
              </button>
            ) : (
              <span />
            )}
            <Link href={backHref} className="text-gray-500 hover:text-[#FF0077]">
              {backLabel}
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
          Enter the email for your account and we&apos;ll send you a code and a link to reset your password.
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
              "Send reset email"
            )}
          </Button>
          <Link href={backHref} className="block text-center text-sm text-gray-500 hover:text-[#FF0077] mt-4">
            {backLabel}
          </Link>
        </form>
      </div>
    </div>
  );
}
