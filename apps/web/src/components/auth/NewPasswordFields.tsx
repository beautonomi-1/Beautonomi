"use client";

import React, { useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";
import { Input } from "@/components/ui/input";
import type { PublicAuthPolicy } from "@/lib/config/auth-policy-public";
import { getPasswordStrength } from "@/lib/auth/password-strength";

const INPUT_CLASS =
  "h-12 rounded-xl border border-gray-200 bg-gray-50/80 px-3.5 text-base font-normal text-gray-900 placeholder:text-gray-400 focus-visible:border-[#FF0077] focus-visible:ring-2 focus-visible:ring-[#FF0077]/20 focus-visible:ring-offset-0";

type Props = {
  idPrefix: string;
  password: string;
  onPasswordChange: (value: string) => void;
  confirm: string;
  onConfirmChange: (value: string) => void;
  policy: Pick<PublicAuthPolicy, "minimum_password_length" | "password_requirements">;
  disabled?: boolean;
  passwordInputRef?: React.Ref<HTMLInputElement>;
  autoFocus?: boolean;
};

/** New password + confirmation with policy hint, strength meter, and live match feedback. */
export function NewPasswordFields({
  idPrefix,
  password,
  onPasswordChange,
  confirm,
  onConfirmChange,
  policy,
  disabled,
  passwordInputRef,
  autoFocus,
}: Props) {
  const { t } = useTranslation();
  const rp = (key: string, opts?: Record<string, unknown>) =>
    t(`web.accountSettings.loginAndSecurity.resetPassword.${key}`, opts);
  const [visible, setVisible] = useState(false);
  const strength = getPasswordStrength(password);
  const passwordId = `${idPrefix}-new-password`;
  const confirmId = `${idPrefix}-confirm-password`;
  const hintId = `${idPrefix}-password-hint`;
  const strengthId = `${idPrefix}-password-strength`;
  const matchId = `${idPrefix}-password-match`;
  const matches = confirm.length > 0 && confirm === password;

  const policyHint =
    policy.password_requirements === "letters_and_digits"
      ? rp("policyHintLettersDigits")
      : policy.password_requirements === "lowercase_uppercase_number"
        ? rp("policyHintMixed")
        : null;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={passwordId} className="mb-1.5 block text-[13px] font-semibold text-gray-700">
          {t("web.accountSettings.loginAndSecurity.newPassword")}
        </label>
        <div className="relative">
          <Input
            id={passwordId}
            ref={passwordInputRef}
            type={visible ? "text" : "password"}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder={rp("atLeastChars", { min: policy.minimum_password_length })}
            autoComplete="new-password"
            autoFocus={autoFocus}
            disabled={disabled}
            aria-describedby={`${hintId} ${strengthId}`}
            className={`${INPUT_CLASS} pe-11`}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute end-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
            aria-label={visible ? rp("hidePassword") : rp("showPassword")}
            aria-pressed={visible}
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        <p id={hintId} className="mt-1.5 text-xs text-gray-500">
          {rp("atLeastChars", { min: policy.minimum_password_length })}
          {policyHint ? ` · ${policyHint}` : ""}
        </p>
        <div id={strengthId} role="status" aria-live="polite" className="mt-2">
          {password.length > 0 ? (
            <>
              <div className="flex gap-1" aria-hidden>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${i <= strength.score ? strength.barClass : "bg-gray-200"}`}
                  />
                ))}
              </div>
              <p className={`mt-1 text-xs font-medium ${strength.textClass}`}>
                {rp("strength", { label: t(`auth.${strength.labelKey}`) })}
                {strength.score < 4 ? <span className="font-normal text-gray-500"> — {rp("strengthTip")}</span> : null}
              </p>
            </>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor={confirmId} className="mb-1.5 block text-[13px] font-semibold text-gray-700">
          {t("web.accountSettings.loginAndSecurity.confirmPassword")}
        </label>
        <Input
          id={confirmId}
          type={visible ? "text" : "password"}
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
          placeholder={rp("confirmPlaceholder")}
          autoComplete="new-password"
          disabled={disabled}
          aria-describedby={matchId}
          aria-invalid={confirm.length > 0 && !matches}
          className={INPUT_CLASS}
        />
        <p id={matchId} aria-live="polite" className="mt-1.5 min-h-[1rem] text-xs">
          {confirm.length > 0 ? (
            matches ? (
              <span className="inline-flex items-center gap-1 text-green-600">
                <Check className="h-3.5 w-3.5" aria-hidden /> {rp("passwordsMatch")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-600">
                <X className="h-3.5 w-3.5" aria-hidden /> {rp("passwordsMismatch")}
              </span>
            )
          ) : null}
        </p>
      </div>
    </div>
  );
}
