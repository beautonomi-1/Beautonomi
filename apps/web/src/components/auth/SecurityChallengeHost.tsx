"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEVICE_VERIFICATION_REQUIRED,
  PROVIDER_MFA_REQUIRED,
  STEP_UP_REQUIRED,
  formatAvailableAt,
  registerSecurityChallengeHandler,
  securityErrorMessage,
  startFirstTotpChallenge,
  startStepUpCode,
  verifyMfaTotp,
  verifyStepUp,
  type CodeChallenge,
  type PendingSecurityChallenge,
} from "@beautonomi/auth-security";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpDigitInput } from "@/components/ui/otp-digit-input";
import { getSupabaseClient } from "@/lib/supabase/client";
import { webSecurityApi } from "@/lib/auth/security-api";
import { SessionVerifyPanel } from "@/components/auth/security/SessionVerifyPanel";

type Method = "totp" | "code" | "sms_signin" | "password";

const METHOD_LABEL: Record<Method, string> = {
  totp: "Authenticator app",
  code: "Email code",
  sms_signin: "Text message",
  password: "Password",
};

function isMethod(m: string): m is Method {
  return m === "totp" || m === "code" || m === "sms_signin" || m === "password";
}

const ACTION_LABEL: Record<string, string> = {
  payout_account: "change payout details",
  stripe_connect: "connect a payout account",
  contact_change: "change your contact details",
  password_change: "change your password",
  team_change: "change your team",
};

function supabaseClient(): SupabaseClient | null {
  return getSupabaseClient() as unknown as SupabaseClient | null;
}

/**
 * Resolves 403 security challenges raised by the API (step-up, provider MFA, new device) in a
 * dialog; the original request is retried once on success.
 */
export function SecurityChallengeHost() {
  const [challenge, setChallenge] = useState<PendingSecurityChallenge | null>(null);
  const [method, setMethod] = useState<Method>("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totp, setTotp] = useState<{ factorId: string; challengeId: string } | null>(null);
  const [emailChallenge, setEmailChallenge] = useState<CodeChallenge | null>(null);
  const [smsPhone, setSmsPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const reset = () => {
    setPassword("");
    setCode("");
    setTotp(null);
    setEmailChallenge(null);
    setSmsPhone(null);
    setError(null);
    setBusy(false);
  };

  const finish = useCallback((success: boolean) => {
    resolveRef.current?.(success);
    resolveRef.current = null;
    setChallenge(null);
    reset();
  }, []);

  useEffect(() => {
    registerSecurityChallengeHandler((pending) => {
      const offered = (pending.details?.methods ?? []).filter(isMethod);
      reset();
      setMethod(offered[0] ?? "password");
      setChallenge(pending);
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
      });
    });
    return () => {
      registerSecurityChallengeHandler(null);
      resolveRef.current?.(false);
      resolveRef.current = null;
    };
  }, []);

  const isStepUp = challenge?.code === STEP_UP_REQUIRED;
  const deviceTooNew = isStepUp && challenge?.details?.reason === "device_too_new";
  const methods = (challenge?.details?.methods ?? []).filter(isMethod);
  const actionLabel = challenge?.details?.action ? ACTION_LABEL[challenge.details.action] : undefined;

  useEffect(() => {
    if (!isStepUp || deviceTooNew) return;
    let cancelled = false;
    setError(null);
    setCode("");
    if (method === "totp" && !totp) {
      const supabase = supabaseClient();
      if (!supabase) return;
      void startFirstTotpChallenge(supabase).then((ch) => {
        if (cancelled) return;
        if ("error" in ch) setError(ch.error.message);
        else setTotp(ch);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [isStepUp, deviceTooNew, method, totp]);

  const sendEmailCode = async () => {
    setBusy(true);
    setError(null);
    const res = await startStepUpCode(webSecurityApi, challenge?.details?.action);
    setBusy(false);
    if (res.error) {
      setError(securityErrorMessage(res.error));
      return;
    }
    setCode("");
    setEmailChallenge(res.data);
  };

  const sendSms = async () => {
    const supabase = supabaseClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { data } = await supabase.auth.getUser();
    const raw = data.user?.phone;
    if (!raw) {
      setBusy(false);
      setError("There's no phone number on this account.");
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
    setSmsPhone(phone);
  };

  const grant = async (input: Parameters<typeof verifyStepUp>[1]) => {
    const res = await verifyStepUp(webSecurityApi, input);
    if (res.error) {
      setError(securityErrorMessage(res.error));
      setBusy(false);
      return false;
    }
    finish(true);
    return true;
  };

  const submit = async (value?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (method === "password") {
      if (!password) {
        setError("Enter your password to continue.");
        setBusy(false);
        return;
      }
      await grant({ method: "password", password });
      return;
    }
    const digits = (value ?? code).replace(/\D/g, "");
    if (digits.length !== 6) {
      setBusy(false);
      return;
    }
    if (method === "code") {
      if (!emailChallenge) {
        setBusy(false);
        return;
      }
      const ok = await grant({ method: "code", challenge_id: emailChallenge.challenge_id, code: digits });
      if (!ok) setCode("");
      return;
    }
    if (method === "sms_signin") {
      const supabase = supabaseClient();
      if (!supabase || !smsPhone) {
        setBusy(false);
        return;
      }
      const { error: otpError } = await supabase.auth.verifyOtp({ phone: smsPhone, token: digits, type: "sms" });
      if (otpError) {
        setError("That code isn't right. Check the text message and try again.");
        setCode("");
        setBusy(false);
        return;
      }
      await grant({ method: "sms_signin" });
      return;
    }
    const supabase = supabaseClient();
    if (!supabase || !totp) {
      setBusy(false);
      return;
    }
    const { error: mfaError } = await verifyMfaTotp(supabase, totp.factorId, totp.challengeId, digits);
    if (mfaError) {
      setError("That code isn't right. Use the current code from your authenticator app.");
      setCode("");
      setTotp(null);
      setBusy(false);
      return;
    }
    await grant({ method: "totp" });
  };

  const sessionChallenge =
    challenge?.code === PROVIDER_MFA_REQUIRED || challenge?.code === DEVICE_VERIFICATION_REQUIRED;

  const title = sessionChallenge
    ? challenge?.code === PROVIDER_MFA_REQUIRED
      ? "Two-step verification"
      : "Verify this device"
    : deviceTooNew
      ? "Not available on this device yet"
      : "Confirm it's you";

  const description = deviceTooNew
    ? `${challenge?.message ?? ""} ${
        formatAvailableAt(challenge?.details?.available_at)
          ? `You can do this ${formatAvailableAt(challenge?.details?.available_at)}, or from a device you've used before.`
          : "Try again from a device you've used before."
      }`
    : sessionChallenge
      ? "Finish verifying this session to continue."
      : actionLabel
        ? `To ${actionLabel}, confirm it's really you.`
        : (challenge?.message ?? "Confirm it's you to continue.");

  return (
    <Dialog open={challenge !== null} onOpenChange={(v) => !v && finish(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {sessionChallenge ? <SessionVerifyPanel onDone={() => finish(true)} /> : null}

        {isStepUp && !deviceTooNew ? (
          <div className="space-y-4">
            {methods.length > 1 ? (
              <div role="tablist" aria-label="Verification method" className="flex flex-wrap gap-2">
                {methods.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={method === m}
                    onClick={() => setMethod(m)}
                    disabled={busy}
                    className={`rounded-full border px-3 py-1 text-sm ${
                      method === m ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700"
                    }`}
                  >
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
            ) : null}

            {method === "password" ? (
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                placeholder="Your password"
                autoComplete="current-password"
                aria-label="Password"
                autoFocus
              />
            ) : null}

            {method === "totp" ? (
              <OtpDigitInput
                value={code}
                onChange={setCode}
                onComplete={(v) => void submit(v)}
                disabled={busy || !totp}
                autoFocus
                label="Authenticator code"
              />
            ) : null}

            {method === "code" ? (
              emailChallenge ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Enter the 6-digit code we sent to <strong>{emailChallenge.sent_to}</strong>.
                  </p>
                  <OtpDigitInput
                    value={code}
                    onChange={setCode}
                    onComplete={(v) => void submit(v)}
                    disabled={busy}
                    autoFocus
                    label="Email code"
                  />
                  <button
                    type="button"
                    className="text-sm text-gray-700 underline"
                    onClick={() => void sendEmailCode()}
                    disabled={busy}
                  >
                    Send a new code
                  </button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => void sendEmailCode()} disabled={busy}>
                  {busy ? "Sending…" : "Email me a code"}
                </Button>
              )
            ) : null}

            {method === "sms_signin" ? (
              smsPhone ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Enter the 6-digit code we texted to your phone.</p>
                  <OtpDigitInput
                    value={code}
                    onChange={setCode}
                    onComplete={(v) => void submit(v)}
                    disabled={busy}
                    autoFocus
                    label="SMS code"
                  />
                  <button
                    type="button"
                    className="text-sm text-gray-700 underline"
                    onClick={() => void sendSms()}
                    disabled={busy}
                  >
                    Send a new code
                  </button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => void sendSms()} disabled={busy}>
                  {busy ? "Sending…" : "Text me a code"}
                </Button>
              )
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => finish(false)} disabled={busy}>
            {deviceTooNew ? "Close" : "Cancel"}
          </Button>
          {isStepUp && method === "password" && !deviceTooNew ? (
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? "Checking…" : "Continue"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
