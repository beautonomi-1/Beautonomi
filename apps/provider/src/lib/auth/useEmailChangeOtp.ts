import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { api } from "@/lib/api-client";
import { supabase } from "@/lib/supabase/client";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  normalizeSupabaseSmsOtpToken,
  isCompleteOtpForLength,
  SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS,
  SUPABASE_AUTH_OTP_LENGTH,
} from "@/lib/supabase-sms-otp";
import { isMailableEmail } from "@beautonomi/utils";

export type EmailChangeStep = "enter_email" | "enter_otp" | null;

type UseEmailChangeOtpOptions = {
  otpLength?: number;
  onVerified?: (email: string) => void;
  errorTitle?: string;
  strings?: {
    invalidEmail?: string;
    enterOtp?: string;
    sendFailed?: string;
    verifyFailedTitle?: string;
    verifyFailedBody?: string;
    verifiedTitle?: string;
    verifiedBody?: string;
  };
};

export function useEmailChangeOtp(options: UseEmailChangeOtpOptions = {}) {
  const otpLength = options.otpLength ?? SUPABASE_AUTH_OTP_LENGTH;
  const [step, setStep] = useState<EmailChangeStep>(null);
  const [newEmail, setNewEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const reset = useCallback(() => {
    setStep(null);
    setNewEmail("");
    setPendingEmail("");
    setOtpCode("");
    setResendCooldown(0);
  }, []);

  const sendCode = useCallback(async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !isMailableEmail(trimmed)) {
      Alert.alert(
        options.errorTitle ?? "Error",
        options.strings?.invalidEmail ?? "Enter a valid email address.",
      );
      return;
    }
    setSending(true);
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      const confirmedEmail = authUser?.email?.trim() || "";
      const emailConfirmedAt = authUser?.email_confirmed_at;

      if (emailConfirmedAt && confirmedEmail.toLowerCase() === trimmed) {
        const res = await api.post("/api/me/email/verify", { email: confirmedEmail });
        if (res.error) throw new Error(getApiErrorMessage(res.error, "Could not save verified email."));
        Alert.alert(
          options.strings?.verifiedTitle ?? "Email verified",
          options.strings?.verifiedBody ?? "Your email address is verified.",
        );
        options.onVerified?.(confirmedEmail);
        reset();
        return;
      }

      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      setPendingEmail(trimmed);
      setOtpCode("");
      setStep("enter_otp");
      setResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      Alert.alert(
        options.errorTitle ?? "Error",
        getApiErrorMessage(e, options.strings?.sendFailed ?? "Could not send verification code."),
      );
    } finally {
      setSending(false);
    }
  }, [newEmail, options, reset]);

  const resendCode = useCallback(async () => {
    if (resendCooldown > 0 || sending || !pendingEmail) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: pendingEmail });
      if (error) throw error;
      setOtpCode("");
      setResendCooldown(SUPABASE_EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      Alert.alert(options.errorTitle ?? "Error", getApiErrorMessage(e, "Could not resend code."));
    } finally {
      setSending(false);
    }
  }, [pendingEmail, resendCooldown, sending, options.errorTitle]);

  const verifyCode = useCallback(
    async (otpOverride?: string) => {
      const token = normalizeSupabaseSmsOtpToken(otpOverride ?? otpCode);
      if (!pendingEmail || !isCompleteOtpForLength(token, otpLength)) {
        Alert.alert(
          options.errorTitle ?? "Error",
          options.strings?.enterOtp ?? `Enter the ${otpLength}-digit code from your email.`,
        );
        return;
      }
      setVerifying(true);
      try {
        const { error } = await supabase.auth.verifyOtp({
          email: pendingEmail,
          token,
          type: "email_change",
        });
        if (error) throw error;
        const res = await api.post("/api/me/email/verify", { email: pendingEmail });
        if (res.error) {
          throw new Error(getApiErrorMessage(res.error, "Email verified but could not save. Please try again."));
        }
        Alert.alert(
          options.strings?.verifiedTitle ?? "Email updated",
          options.strings?.verifiedBody ?? "Your email address has been verified and saved.",
        );
        options.onVerified?.(pendingEmail);
        reset();
      } catch (e) {
        Alert.alert(
          options.strings?.verifyFailedTitle ?? "Verification failed",
          getApiErrorMessage(e, options.strings?.verifyFailedBody ?? "Invalid or expired code."),
        );
      } finally {
        setVerifying(false);
      }
    },
    [pendingEmail, otpCode, otpLength, options, reset],
  );

  return {
    step,
    setStep,
    newEmail,
    setNewEmail,
    pendingEmail,
    otpCode,
    setOtpCode,
    sending,
    verifying,
    resendCooldown,
    sendCode,
    resendCode,
    verifyCode,
    reset,
    otpLength,
  };
}
