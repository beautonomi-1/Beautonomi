import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
import {
  autoVerifyDevice,
  getSessionSecurityStatus,
  redeemRecoveryCode,
  securityErrorMessage,
  startDeviceCode,
  startFirstTotpChallenge,
  verifyDeviceCode,
  verifyMfaTotp,
  type CodeChallenge,
  type SessionSecurityStatus,
} from "@beautonomi/auth-security";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { providerSecurityApi } from "@/lib/security/security-api";
import { ensureDeviceKeyRegistered } from "@/lib/security/ensure-device-key";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { Colors } from "@/constants/colors";

const RESEND_SECONDS = 60;

type Step =
  | { kind: "loading" }
  | { kind: "totp"; factorId: string; challengeId: string }
  | { kind: "recovery" }
  | { kind: "device_code"; challenge: CodeChallenge | null }
  | { kind: "sms_signin"; sent: boolean }
  | { kind: "done" }
  | { kind: "error"; message: string };

export const securityStyles = {
  title: { fontSize: 20, fontWeight: "700" as const, color: Colors.gray[900] },
  body: { fontSize: 15, color: Colors.gray[600], lineHeight: 21, marginTop: 6 },
  hint: { fontSize: 13, color: Colors.gray[500], lineHeight: 18 },
  error: { fontSize: 14, color: Colors.error },
  link: { fontSize: 14, color: Colors.gray[700], fontWeight: "600" as const, textDecorationLine: "underline" as const },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  primary: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" as const },
  primaryText: { color: Colors.white, fontWeight: "600" as const, fontSize: 16 },
  secondary: {
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center" as const,
  },
  secondaryText: { color: Colors.gray[800], fontWeight: "600" as const, fontSize: 16 },
};

/**
 * Completes whatever the current session still needs (authenticator code, then new-device
 * check). Calls `onDone` once the session status is `ok`.
 */
export function SessionVerifyPanel({ onDone, onSignOut }: { onDone: () => void; onSignOut?: () => void }) {
  const { t } = useTranslation();
  const sk = (key: string, vars?: Record<string, unknown>) =>
    t(`provider.mobile.screens.security.${key}`, vars) as string;
  const { session, signInWithOtp, verifyOtp } = useAuth();
  const phone = session?.user?.phone ? `+${session.user.phone.replace(/^\+/, "")}` : null;
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [status, setStatus] = useState<SessionSecurityStatus | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendDeviceCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await startDeviceCode(providerSecurityApi);
    setBusy(false);
    if (res.error) {
      if (res.error.code === "NO_EMAIL_ON_FILE") {
        setStep({ kind: "sms_signin", sent: false });
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
    await ensureDeviceKeyRegistered().catch(() => null);
    const res = await getSessionSecurityStatus(providerSecurityApi, { sync: true });
    if (res.error || !res.data) {
      setStep({ kind: "error", message: securityErrorMessage(res.error, sk("statusFailed")) });
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
    const auto = await autoVerifyDevice(providerSecurityApi);
    if (auto.data?.status === "trusted") {
      await resolve();
      return;
    }
    const methods = auto.data?.methods ?? res.data.device.methods;
    if (methods.includes("email_code")) {
      await sendDeviceCode();
    } else {
      setStep({ kind: "sms_signin", sent: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone, sendDeviceCode]);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  const submitTotp = async (value: string) => {
    if (step.kind !== "totp" || value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await verifyMfaTotp(supabase, step.factorId, step.challengeId, value);
    setBusy(false);
    if (verifyError) {
      setCode("");
      setError(sk("wrongTotp"));
      const ch = await startFirstTotpChallenge(supabase);
      if (!("error" in ch)) setStep({ kind: "totp", factorId: ch.factorId, challengeId: ch.challengeId });
      return;
    }
    await resolve();
  };

  const submitDeviceCode = async (value: string) => {
    if (step.kind !== "device_code" || !step.challenge || value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const res = await verifyDeviceCode(providerSecurityApi, step.challenge.challenge_id, value);
    setBusy(false);
    if (res.error) {
      setCode("");
      setError(securityErrorMessage(res.error));
      return;
    }
    await resolve();
  };

  const submitRecovery = async () => {
    if (!recovery.trim() || busy) return;
    setBusy(true);
    setError(null);
    const res = await redeemRecoveryCode(providerSecurityApi, recovery.trim());
    setBusy(false);
    if (res.error) {
      setError(securityErrorMessage(res.error));
      return;
    }
    setRecovery("");
    await resolve();
  };

  const sendSms = async () => {
    if (!phone || busy) return;
    setBusy(true);
    setError(null);
    const { error: smsError } = await signInWithOtp(phone);
    setBusy(false);
    if (smsError) {
      setError(smsError.message);
      return;
    }
    setCode("");
    setResendIn(RESEND_SECONDS);
    setStep({ kind: "sms_signin", sent: true });
  };

  const submitSms = async (value: string) => {
    if (!phone || value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error: otpError } = await verifyOtp(phone, value);
    setBusy(false);
    if (otpError) {
      setCode("");
      setError(otpError.message);
      return;
    }
    await resolve();
  };

  if (step.kind === "loading" || step.kind === "done") {
    return (
      <View style={{ paddingVertical: 24, alignItems: "center" }} accessibilityLabel={sk("checking")}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {step.kind === "totp" ? (
        <>
          <View>
            <Text style={securityStyles.title}>{sk("verifyTotpTitle")}</Text>
            <Text style={securityStyles.body}>{sk("verifyTotpBody")}</Text>
          </View>
          <OtpDigitRow
            value={code}
            onChange={setCode}
            onComplete={(v) => void submitTotp(v)}
            disabled={busy}
            autoFocus
            accessibilityLabelPrefix={sk("verifyTotpTitle")}
          />
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              setStep({ kind: "recovery" });
            }}
          >
            <Text style={securityStyles.link}>{sk("useRecoveryLink")}</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {step.kind === "recovery" ? (
        <>
          <View>
            <Text style={securityStyles.title}>{sk("recoveryTitle")}</Text>
            <Text style={securityStyles.body}>{sk("recoveryBody")}</Text>
          </View>
          <TextInput
            value={recovery}
            onChangeText={setRecovery}
            placeholder="XXXXX-XXXXX"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            accessibilityLabel={sk("recoveryTitle")}
            style={securityStyles.input}
          />
          <TouchableOpacity
            accessibilityRole="button"
            style={[securityStyles.primary, (!recovery.trim() || busy) && { opacity: 0.6 }]}
            onPress={() => void submitRecovery()}
            disabled={busy || !recovery.trim()}
          >
            {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={securityStyles.primaryText}>{sk("recoverySubmit")}</Text>}
          </TouchableOpacity>
          {status?.mfa.enrolled ? (
            <TouchableOpacity accessibilityRole="button" onPress={() => void resolve()} disabled={busy}>
              <Text style={securityStyles.link}>{sk("backToAuthenticator")}</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={securityStyles.hint}>{sk("recoveryNoCodes")}</Text>
        </>
      ) : null}

      {step.kind === "device_code" ? (
        <>
          <View>
            <Text style={securityStyles.title}>{sk("deviceCodeTitle")}</Text>
            <Text style={securityStyles.body}>
              {sk("deviceCodeBody", { email: step.challenge?.sent_to ?? status?.masked_email ?? "" })}
            </Text>
          </View>
          <OtpDigitRow
            value={code}
            onChange={setCode}
            onComplete={(v) => void submitDeviceCode(v)}
            disabled={busy}
            autoFocus
            accessibilityLabelPrefix={sk("deviceCodeTitle")}
          />
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy || resendIn > 0}
            onPress={() => void sendDeviceCode()}
          >
            <Text style={[securityStyles.link, resendIn > 0 && { color: Colors.gray[400], textDecorationLine: "none" }]}>
              {resendIn > 0 ? sk("resendIn", { seconds: resendIn }) : sk("resend")}
            </Text>
          </TouchableOpacity>
          <Text style={securityStyles.hint}>{sk("deviceCodeHint")}</Text>
        </>
      ) : null}

      {step.kind === "sms_signin" ? (
        <>
          <View>
            <Text style={securityStyles.title}>{sk("smsTitle")}</Text>
            <Text style={securityStyles.body}>{phone ? sk("smsBody") : sk("smsNoPhone")}</Text>
          </View>
          {phone && step.sent ? (
            <>
              <OtpDigitRow
                value={code}
                onChange={setCode}
                onComplete={(v) => void submitSms(v)}
                disabled={busy}
                autoFocus
                smsAutofill
                accessibilityLabelPrefix={sk("smsTitle")}
              />
              <TouchableOpacity accessibilityRole="button" disabled={busy || resendIn > 0} onPress={() => void sendSms()}>
                <Text style={[securityStyles.link, resendIn > 0 && { color: Colors.gray[400], textDecorationLine: "none" }]}>
                  {resendIn > 0 ? sk("resendIn", { seconds: resendIn }) : sk("resend")}
                </Text>
              </TouchableOpacity>
            </>
          ) : phone ? (
            <TouchableOpacity accessibilityRole="button" style={securityStyles.primary} onPress={() => void sendSms()} disabled={busy}>
              {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={securityStyles.primaryText}>{sk("smsSend")}</Text>}
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}

      {step.kind === "error" ? (
        <>
          <Text style={securityStyles.error} accessibilityRole="alert">{step.message}</Text>
          <TouchableOpacity accessibilityRole="button" style={securityStyles.secondary} onPress={() => void resolve()}>
            <Text style={securityStyles.secondaryText}>{sk("tryAgain")}</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {error ? <Text style={securityStyles.error} accessibilityRole="alert">{error}</Text> : null}

      {onSignOut ? (
        <TouchableOpacity accessibilityRole="button" onPress={onSignOut}>
          <Text style={[securityStyles.hint, { textAlign: "center", textDecorationLine: "underline" }]}>{sk("signOut")}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
