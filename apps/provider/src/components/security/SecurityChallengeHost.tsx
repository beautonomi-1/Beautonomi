import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTranslation } from "@beautonomi/i18n";
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
  type StepUpInput,
} from "@beautonomi/auth-security";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { OtpDigitRow } from "@/components/OtpDigitRow";
import { supabase } from "@/lib/supabase/client";
import { providerSecurityApi } from "@/lib/security/security-api";
import { useAuth } from "@/providers/AuthProvider";
import { Colors } from "@/constants/colors";
import { SessionVerifyPanel, securityStyles } from "./SessionVerifyPanel";

type Method = "totp" | "code" | "sms_signin" | "password";

const ACTION_KEYS: Record<string, string> = {
  payout_account: "actionPayout",
  stripe_connect: "actionStripe",
  password_change: "actionPassword",
  team_change: "actionTeam",
};

function offeredMethods(challenge: PendingSecurityChallenge | null): Method[] {
  return (challenge?.details?.methods ?? []).filter(
    (m): m is Method => m === "totp" || m === "code" || m === "sms_signin" || m === "password",
  );
}

/**
 * Resolves 403 security challenges raised by the API (step-up, provider MFA, new device) in a
 * bottom sheet; the original request is retried once on success.
 */
export function SecurityChallengeHost() {
  const { t } = useTranslation();
  const sk = (key: string, vars?: Record<string, unknown>) =>
    t(`provider.mobile.screens.security.${key}`, vars) as string;
  const [challenge, setChallenge] = useState<PendingSecurityChallenge | null>(null);
  const [method, setMethod] = useState<Method>("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totp, setTotp] = useState<{ factorId: string; challengeId: string } | null>(null);
  const [emailChallenge, setEmailChallenge] = useState<CodeChallenge | null>(null);
  const [smsSent, setSmsSent] = useState(false);
  const { session, signInWithOtp, verifyOtp } = useAuth();
  const phone = session?.user?.phone || null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const reset = () => {
    setPassword("");
    setCode("");
    setTotp(null);
    setEmailChallenge(null);
    setSmsSent(false);
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
      reset();
      setMethod(offeredMethods(pending)[0] ?? "password");
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
  const sessionChallenge =
    challenge?.code === PROVIDER_MFA_REQUIRED || challenge?.code === DEVICE_VERIFICATION_REQUIRED;
  const methods = offeredMethods(challenge);

  useEffect(() => {
    if (!isStepUp || deviceTooNew || method !== "totp" || totp) return;
    let cancelled = false;
    void startFirstTotpChallenge(supabase).then((ch) => {
      if (cancelled) return;
      if ("error" in ch) setError(ch.error.message);
      else setTotp(ch);
    });
    return () => {
      cancelled = true;
    };
  }, [isStepUp, deviceTooNew, method, totp]);

  const grant = async (input: StepUpInput) => {
    const res = await verifyStepUp(providerSecurityApi, input);
    if (res.error) {
      setError(securityErrorMessage(res.error));
      setBusy(false);
      return false;
    }
    finish(true);
    return true;
  };

  const sendEmailCode = async () => {
    setBusy(true);
    setError(null);
    const res = await startStepUpCode(providerSecurityApi, challenge?.details?.action);
    setBusy(false);
    if (res.error) {
      setError(securityErrorMessage(res.error));
      return;
    }
    setCode("");
    setEmailChallenge(res.data);
  };

  const sendSms = async () => {
    if (!phone) {
      setError(sk("smsNoPhone"));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: smsError } = await signInWithOtp(phone);
    setBusy(false);
    if (smsError) {
      setError(smsError.message);
      return;
    }
    setCode("");
    setSmsSent(true);
  };

  const submit = async (value?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (method === "password") {
      if (!password) {
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
      if (!(await grant({ method: "code", challenge_id: emailChallenge.challenge_id, code: digits }))) setCode("");
      return;
    }
    if (method === "sms_signin") {
      if (!phone) {
        setBusy(false);
        return;
      }
      const { error: otpError } = await verifyOtp(phone, digits);
      if (otpError) {
        setError(otpError.message);
        setCode("");
        setBusy(false);
        return;
      }
      await grant({ method: "sms_signin" });
      return;
    }
    if (!totp) {
      setBusy(false);
      return;
    }
    const { error: mfaError } = await verifyMfaTotp(supabase, totp.factorId, totp.challengeId, digits);
    if (mfaError) {
      setError(sk("wrongTotp"));
      setCode("");
      setTotp(null);
      setBusy(false);
      return;
    }
    await grant({ method: "totp" });
  };

  const actionKey = challenge?.details?.action ? ACTION_KEYS[challenge.details.action] : undefined;
  const when = formatAvailableAt(challenge?.details?.available_at);

  const title = sessionChallenge
    ? challenge?.code === PROVIDER_MFA_REQUIRED
      ? sk("mfaRequiredTitle")
      : sk("deviceVerifyTitle")
    : deviceTooNew
      ? sk("deviceTooNewTitle")
      : sk("challengeTitle");

  const subtitle = deviceTooNew
    ? `${challenge?.message ?? ""} ${when ? sk("deviceTooNewBody", { when }) : sk("deviceTooNewFallback")}`
    : sessionChallenge
      ? sk("sessionChallengeBody")
      : actionKey
        ? sk("stepUpActionBody", { action: sk(actionKey) })
        : (challenge?.message ?? sk("challengeBody"));

  const methodLabel: Record<Method, string> = {
    totp: sk("methodTotp"),
    code: sk("methodCode"),
    sms_signin: sk("methodSms"),
    password: sk("methodPassword"),
  };

  return (
    <BottomSheet visible={challenge !== null} onClose={() => finish(false)} title={title} subtitle={subtitle} snapHeight="auto">
      <View style={{ gap: 14, paddingBottom: 8 }}>
        {sessionChallenge ? <SessionVerifyPanel onDone={() => finish(true)} /> : null}

        {isStepUp && !deviceTooNew ? (
          <>
            {methods.length > 1 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="tablist">
                {methods.map((m) => (
                  <TouchableOpacity
                    key={m}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: method === m }}
                    disabled={busy}
                    onPress={() => {
                      setError(null);
                      setCode("");
                      setMethod(m);
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: method === m ? Colors.gray[900] : Colors.gray[300],
                      backgroundColor: method === m ? Colors.gray[900] : Colors.white,
                    }}
                  >
                    <Text style={{ color: method === m ? Colors.white : Colors.gray[700], fontSize: 14 }}>
                      {methodLabel[m]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {method === "password" ? (
              <>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder={sk("passwordPlaceholder")}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  textContentType="password"
                  onSubmitEditing={() => void submit()}
                  accessibilityLabel={sk("methodPassword")}
                  style={securityStyles.input}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[securityStyles.primary, (!password || busy) && { opacity: 0.6 }]}
                  onPress={() => void submit()}
                  disabled={busy || !password}
                >
                  {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={securityStyles.primaryText}>{sk("continue")}</Text>}
                </TouchableOpacity>
              </>
            ) : null}

            {method === "totp" ? (
              <OtpDigitRow
                value={code}
                onChange={setCode}
                onComplete={(v) => void submit(v)}
                disabled={busy || !totp}
                autoFocus
                accessibilityLabelPrefix={sk("methodTotp")}
              />
            ) : null}

            {method === "code" ? (
              emailChallenge ? (
                <>
                  <Text style={securityStyles.body}>{sk("codeSentTo", { email: emailChallenge.sent_to })}</Text>
                  <OtpDigitRow
                    value={code}
                    onChange={setCode}
                    onComplete={(v) => void submit(v)}
                    disabled={busy}
                    autoFocus
                    accessibilityLabelPrefix={sk("methodCode")}
                  />
                  <TouchableOpacity accessibilityRole="button" onPress={() => void sendEmailCode()} disabled={busy}>
                    <Text style={securityStyles.link}>{sk("sendNewCode")}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity accessibilityRole="button" style={securityStyles.primary} onPress={() => void sendEmailCode()} disabled={busy}>
                  {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={securityStyles.primaryText}>{sk("emailMeCode")}</Text>}
                </TouchableOpacity>
              )
            ) : null}

            {method === "sms_signin" ? (
              smsSent ? (
                <>
                  <Text style={securityStyles.body}>{sk("smsSentBody")}</Text>
                  <OtpDigitRow
                    value={code}
                    onChange={setCode}
                    onComplete={(v) => void submit(v)}
                    disabled={busy}
                    autoFocus
                    smsAutofill
                    accessibilityLabelPrefix={sk("methodSms")}
                  />
                  <TouchableOpacity accessibilityRole="button" onPress={() => void sendSms()} disabled={busy}>
                    <Text style={securityStyles.link}>{sk("sendNewCode")}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity accessibilityRole="button" style={securityStyles.primary} onPress={() => void sendSms()} disabled={busy}>
                  {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={securityStyles.primaryText}>{sk("smsSend")}</Text>}
                </TouchableOpacity>
              )
            ) : null}
          </>
        ) : null}

        {error ? <Text style={securityStyles.error} accessibilityRole="alert">{error}</Text> : null}

        <TouchableOpacity accessibilityRole="button" onPress={() => finish(false)} disabled={busy}>
          <Text style={{ textAlign: "center", color: Colors.gray[500], paddingVertical: 6 }}>
            {deviceTooNew ? sk("close") : sk("cancel")}
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}
