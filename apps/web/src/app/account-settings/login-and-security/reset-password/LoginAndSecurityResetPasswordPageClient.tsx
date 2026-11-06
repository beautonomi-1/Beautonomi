"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { updatePassword } from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DEFAULT_PUBLIC_AUTH, type PublicAuthPolicy } from "@/lib/config/auth-policy-public";
import { getNewPasswordIssue } from "@/lib/auth/password-strength";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NewPasswordFields } from "@/components/auth/NewPasswordFields";
import { useTranslation } from "@beautonomi/i18n";
import { buildForgotPasswordHref } from "@/lib/auth/forgot-password-href";
import { sanitizeRelativeRedirect } from "@/lib/auth/post-login-return-path";

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [policy, setPolicy] = useState<PublicAuthPolicy>(DEFAULT_PUBLIC_AUTH);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");

    const tryReady = () => setIsReady(true);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          tryReady();
        }
      }
    );

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        tryReady();
        return;
      }
      if (tokenHash && type === "recovery") {
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (verifyErr) {
          setVerifyError(verifyErr.message);
          return;
        }
        tryReady();
        const nextKeep = searchParams.get("next");
        const clean =
          nextKeep && nextKeep.startsWith("/") && !nextKeep.startsWith("//")
            ? `${window.location.pathname}?next=${encodeURIComponent(nextKeep)}`
            : window.location.pathname;
        window.history.replaceState({}, "", clean);
      }
    })();

    return () => subscription.unsubscribe();
  }, [searchParams]);

  useEffect(() => {
    if (!isReady) return;
    fetch("/api/me/profile", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        const nextPolicy = json?.data?.auth_security?.policy;
        if (nextPolicy && typeof nextPolicy.minimum_password_length === "number") {
          setPolicy(nextPolicy as PublicAuthPolicy);
        }
      })
      .catch(() => {});
  }, [isReady]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const issue = getNewPasswordIssue(newPassword, confirmPassword, policy);
    if (issue === "minLength") {
      setError(t("web.accountSettings.loginAndSecurity.resetPassword.minLength", {
        min: policy.minimum_password_length,
      }));
      return;
    }
    if (issue === "policy") {
      setError(t("web.accountSettings.loginAndSecurity.resetPassword.policyMix"));
      return;
    }
    if (issue === "mismatch") {
      setError(t("web.accountSettings.loginAndSecurity.resetPassword.passwordsMismatch"));
      return;
    }

    setIsSubmitting(true);
    try {
      await updatePassword(newPassword);
      await fetcher.post("/api/me/password/changed", {}).catch(() => {});
      setSuccess(true);
      toast.success(t("web.accountSettings.loginAndSecurity.passwordUpdated"));
      const nextRaw = searchParams.get("next");
      const nextPath =
        nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/";
      setTimeout(() => router.push(nextPath), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("web.accountSettings.loginAndSecurity.updatePasswordFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div
          className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-lg"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900">
            {t("web.accountSettings.loginAndSecurity.resetPassword.updatedTitle")}
          </h2>
          <p className="text-sm text-gray-500">
            {t("web.accountSettings.loginAndSecurity.resetPassword.updatedBody")}
          </p>
        </div>
      </div>
    );
  }

  if (verifyError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div
          className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-8 text-center shadow-lg"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <AlertCircle className="h-7 w-7 text-red-600" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            {t("web.accountSettings.loginAndSecurity.resetPassword.invalidLink")}
          </h2>
          <p className="mb-6 text-sm text-gray-500">{verifyError}</p>
          <Button
            onClick={() => {
              const next = sanitizeRelativeRedirect(searchParams.get("next"));
              router.push(buildForgotPasswordHref({ next }));
            }}
            className="w-full mb-2"
          >
            {t("web.accountSettings.loginAndSecurity.resetPassword.requestNewLink")}
          </Button>
          <button type="button" onClick={() => router.push("/")} className="text-sm text-gray-500 hover:text-gray-700">
            {t("web.accountSettings.loginAndSecurity.resetPassword.backToHome")}
          </button>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div
          className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-lg"
        >
          <p className="mx-auto mb-4 text-sm text-gray-500">{t("web.accountSettings.loading.loading")}</p>
          <p className="text-sm text-gray-500">
            {t("web.accountSettings.loginAndSecurity.resetPassword.verifyingLink")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-8">
      <div
        className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-lg"
      >
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
          <Lock className="h-6 w-6 text-gray-700" />
        </div>

        <h1 className="mb-1 text-center text-xl font-semibold text-gray-900">
          {t("web.accountSettings.loginAndSecurity.resetPassword.title")}
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          {t("web.accountSettings.loginAndSecurity.resetPassword.subtitle")}
        </p>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <NewPasswordFields
            idPrefix="reset"
            password={newPassword}
            onPasswordChange={(v) => {
              setNewPassword(v);
              if (error) setError(null);
            }}
            confirm={confirmPassword}
            onConfirmChange={(v) => {
              setConfirmPassword(v);
              if (error) setError(null);
            }}
            policy={policy}
            disabled={isSubmitting}
            autoFocus
          />

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting || !newPassword || !confirmPassword}
            className="w-full"
          >
            {isSubmitting
              ? t("web.accountSettings.loginAndSecurity.updating")
              : t("web.accountSettings.loginAndSecurity.updatePasswordCta")}
          </Button>
        </form>
      </div>
    </div>
  );
}
