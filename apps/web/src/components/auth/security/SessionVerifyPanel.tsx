"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  autoVerifyDevice,
  getSessionSecurityStatus,
  registerDeviceKey,
  securityErrorMessage,
  startDeviceCode,
  startFirstTotpChallenge,
  redeemRecoveryCode,
  verifyDeviceCode,
  verifyMfaTotp,
  type CodeChallenge,
  type SessionSecurityStatus,
} from "@beautonomi/auth-security";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpDigitInput } from "@/components/ui/otp-digit-input";
import { getSupabaseClient } from "@/lib/supabase/client";
import { webSecurityApi } from "@/lib/auth/security-api";
import { getStoredDeviceKey, setStoredDeviceKey } from "@/lib/auth/device-key";

const RESEND_SECONDS = 60;

type Step =
  | { kind: "loading" }
  | { kind: "totp"; factorId: string; challengeId: string }
  | { kind: "recovery" }
  | { kind: "device_code"; challenge: CodeChallenge | null }
  | { kind: "sms_signin" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export async function ensureWebDeviceKey(): Promise<void> {
  if (getStoredDeviceKey()) return;
  const res = await registerDeviceKey(webSecurityApi);
  if (res.data?.device_key) setStoredDeviceKey(res.data.device_key);
}

/**
 * Completes whatever the current session still needs (authenticator code, then new-device
 * check). Calls `onDone` once the session status is `ok`.
 */
export function SessionVerifyPanel({
  onDone,
  onSignOut,
}: {
  onDone: () => void;
  onSignOut?: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [status, setStatus] = useState<SessionSecurityStatus | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [smsPhone, setSmsPhone] = useState<string | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendDeviceCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await startDeviceCode(webSecurityApi);
    setBusy(false);
    if (res.error) {
      if (res.error.code === "NO_EMAIL_ON_FILE") {
        setStep({ kind: "sms_signin" });
        return;
      }
      setError(securityErrorMessage(res.error));
      return;
    }
    setCode("");
    setResendIn(RESEND_SECONDS);
    setStep({ kind: "device_code", challenge: res.data });
  }, []);

  const resolve = useCallback(async () => {
    setError(null);
    setStep({ kind: "loading" });
    await ensureWebDeviceKey().catch(() => undefined);
    const res = await getSessionSecurityStatus(webSecurityApi, { sync: true });
    if (res.error || !res.data) {
      setStep({ kind: "error", message: securityErrorMessage(res.error, "We couldn't check your session.") });
      return;
    }
    setStatus(res.data);
    if (res.data.status === "ok") {
      setStep({ kind: "done" });
      if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
      return;
    }
    if (res.data.status === "mfa_required") {
      const supabase = getSupabaseClient() as unknown as SupabaseClient | null;
      if (!supabase) {
        setStep({ kind: "error", message: "Two-step verification isn't available in this browser." });
        return;
      }
      const ch = await startFirstTotpChallenge(supabase);
      if ("error" in ch) {
        setStep({ kind: "recovery" });
        setError(ch.error.message);
        return;
      }
      setCode("");
      setStep({ kind: "totp", factorId: ch.factorId, challengeId: ch.challengeId });
      return;
    }
    const auto = await autoVerifyDevice(webSecurityApi);
    if (auto.data?.status === "trusted") {
      await resolve();
      return;
    }
    const methods = auto.data?.methods ?? res.data.device.methods;
    if (methods.includes("email_code")) {
      await sendDeviceCode();
    } else {
      setStep({ kind: "sms_signin" });
    }
  }, [onDone, sendDeviceCode]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  const submitTotp = async (value: string) => {
    if (step.kind !== "totp" || value.length !== 6) return;
    const supabase = getSupabaseClient() as unknown as SupabaseClient | null;
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await verifyMfaTotp(supabase, step.factorId, step.challengeId, value);
    setBusy(false);
    if (verifyError) {
      setCode("");
      setError("That code isn't right. Use the current code from your authenticator app.");
      const ch = await startFirstTotpChallenge(supabase);
      if (!("error" in ch)) setStep({ kind: "totp", factorId: ch.factorId, challengeId: ch.challengeId });
      return;
    }
    await resolve();
  };

  const submitDeviceCode = async (value: string) => {
    if (step.kind !== "device_code" || !step.challenge || value.length !== 6) return;
    setBusy(true);
    setError(null);
    const res = await verifyDeviceCode(webSecurityApi, step.challenge.challenge_id, value);
    setBusy(false);
    if (res.error) {
      setCode("");
      setError(securityErrorMessage(res.error));
      return;
    }
    await resolve();
  };

  const submitRecovery = async () => {
    if (!recovery.trim()) return;
    setBusy(true);
    setError(null);
    const res = await redeemRecoveryCode(webSecurityApi, recovery.trim());
    setBusy(false);
    if (res.error) {
      setError(securityErrorMessage(res.error));
      return;
    }
    setRecovery("");
    await resolve();
  };

  const sendSms = async () => {
    const supabase = getSupabaseClient() as unknown as SupabaseClient | null;
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { data } = await supabase.auth.getUser();
    const raw = data.user?.phone;
    if (!raw) {
      setBusy(false);
      setError("There's no email or phone we can send a code to. Contact support to restore access.");
      return;
    }
    const phone = raw.startsWith("+") ? raw : `+${raw}`;
    const { error: smsError } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false, channel: "sms" },
    });
    setBusy(false);
    if (smsError) {
      setError(smsError.message);
      return;
    }
    setCode("");
    setResendIn(RESEND_SECONDS);
    setSmsPhone(phone);
  };

  const submitSms = async (value: string) => {
    const supabase = getSupabaseClient() as unknown as SupabaseClient | null;
    if (!supabase || !smsPhone || value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error: otpError } = await supabase.auth.verifyOtp({ phone: smsPhone, token: value, type: "sms" });
    setBusy(false);
    if (otpError) {
      setCode("");
      setError("That code isn't right. Check the text message and try again.");
      return;
    }
    await resolve();
  };

  if (step.kind === "loading" || step.kind === "done") {
    return <p className="text-sm text-gray-600" role="status">Checking your session…</p>;
  }

  return (
    <div className="space-y-4">
      {step.kind === "totp" ? (
        <>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Enter your authenticator code</h2>
            <p className="mt-1 text-sm text-gray-600">
              Open your authenticator app and enter the 6-digit code for Beautonomi.
            </p>
          </div>
          <OtpDigitInput
            value={code}
            onChange={setCode}
            onComplete={(v) => void submitTotp(v)}
            disabled={busy}
            autoFocus
            label="Authenticator code"
          />
          <button
            type="button"
            className="text-sm font-medium text-gray-700 underline"
            onClick={() => {
              setError(null);
              setStep({ kind: "recovery" });
            }}
          >
            Lost your phone? Use a recovery code
          </button>
        </>
      ) : null}

      {step.kind === "recovery" ? (
        <>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Use a recovery code</h2>
            <p className="mt-1 text-sm text-gray-600">
              Enter one of the recovery codes you saved when you set up two-step verification. This turns off
              two-step verification so you can set up a new authenticator.
            </p>
          </div>
          <Input
            value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
            placeholder="XXXXX-XXXXX"
            autoComplete="one-time-code"
            aria-label="Recovery code"
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void submitRecovery()} disabled={busy || !recovery.trim()}>
              {busy ? "Checking…" : "Use recovery code"}
            </Button>
            {status?.mfa.enrolled ? (
              <Button variant="outline" onClick={() => void resolve()} disabled={busy}>
                Back to authenticator
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-gray-500">
            No recovery codes? Contact support from a known email address to restore access.
          </p>
        </>
      ) : null}

      {step.kind === "device_code" ? (
        <>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Confirm it&apos;s you</h2>
            <p className="mt-1 text-sm text-gray-600">
              This is a new device for your business account. We sent a 6-digit code to{" "}
              <strong>{step.challenge?.sent_to ?? status?.masked_email ?? "your email"}</strong>.
            </p>
          </div>
          <OtpDigitInput
            value={code}
            onChange={setCode}
            onComplete={(v) => void submitDeviceCode(v)}
            disabled={busy}
            autoFocus
            label="Email verification code"
          />
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              className="font-medium text-gray-700 underline disabled:text-gray-400 disabled:no-underline"
              disabled={busy || resendIn > 0}
              onClick={() => void sendDeviceCode()}
            >
              {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Can&apos;t find it? Check spam or promotions. We&apos;ll remember this device so you won&apos;t be asked
            again here.
          </p>
        </>
      ) : null}

      {step.kind === "sms_signin" ? (
        <>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Confirm with your phone</h2>
            <p className="mt-1 text-sm text-gray-600">
              We&apos;ll text a 6-digit code to the phone number on your account.
            </p>
          </div>
          {smsPhone ? (
            <>
              <OtpDigitInput
                value={code}
                onChange={setCode}
                onComplete={(v) => void submitSms(v)}
                disabled={busy}
                autoFocus
                label="SMS code"
              />
              <button
                type="button"
                className="text-sm font-medium text-gray-700 underline disabled:text-gray-400 disabled:no-underline"
                disabled={busy || resendIn > 0}
                onClick={() => void sendSms()}
              >
                {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
              </button>
            </>
          ) : (
            <Button onClick={() => void sendSms()} disabled={busy}>
              {busy ? "Sending…" : "Text me a code"}
            </Button>
          )}
        </>
      ) : null}

      {step.kind === "error" ? (
        <div className="space-y-2">
          <p className="text-sm text-red-600" role="alert">{step.message}</p>
          <Button variant="outline" onClick={() => void resolve()}>Try again</Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}

      {onSignOut ? (
        <button type="button" className="text-sm text-gray-500 underline" onClick={onSignOut}>
          Sign out
        </button>
      ) : null}
    </div>
  );
}
