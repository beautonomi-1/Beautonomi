"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpDigitInput } from "@/components/ui/otp-digit-input";
import { Label } from "@/components/ui/label";
import { signInWithOAuth } from "@/lib/supabase/auth";
import { MarketingConsentCheckbox } from "@/components/auth/MarketingConsentCheckbox";
import { sendAuthOtp, verifyAuthOtp } from "@/lib/auth/auth-otp-client";
import { submitMarketingConsent } from "@/lib/auth/submit-marketing-consent";
import { PENDING_MARKETING_CONSENT_KEY } from "@/lib/auth/persist-marketing-consent";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Mail, Smartphone, Check, X, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  BOOKING_ACCENT,
  BOOKING_BORDER,
  BOOKING_EDGE,
  BOOKING_RADIUS_BUTTON,
  BOOKING_SHADOW_MAIN,
  BOOKING_SHADOW_CARD,
  BOOKING_TEXT_PRIMARY,
  BOOKING_TEXT_SECONDARY,
  MIN_TAP,
  BOOKING_ACTIVE_SCALE,
} from "../constants";
import { isCompleteE164 } from "@/lib/phone";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteOtpForLength,
} from "@/lib/supabase/auth-sms-otp";
import { clearBeautonomiHoldIdCookie } from "@/lib/booking/clear-hold-client-markers";
import { getSocialAuthConfig } from "@/lib/social-auth-config";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { DEFAULT_PUBLIC_AUTH } from "@/lib/config/auth-policy-public";
import { isSafeRelativeRedirect, sanitizeRelativeRedirect } from "@/lib/auth/post-login-return-path";

function resolveGatePostLoginNext(customRedirectUrl: string | undefined, holdId: string): string {
  const fallback = `/book/continue?hold_id=${holdId}`;
  const raw = customRedirectUrl?.trim();
  if (!raw) return fallback;
  if (isSafeRelativeRedirect(raw)) return raw.trim();
  if (typeof window !== "undefined") {
    try {
      const u = new URL(raw, window.location.origin);
      if (u.origin === window.location.origin) {
        const pathWithQuery = `${u.pathname}${u.search}`;
        return sanitizeRelativeRedirect(pathWithQuery) ?? fallback;
      }
    } catch {
      /* use fallback */
    }
  }
  return fallback;
}

function holdSecondsRemaining(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor(ms / 1000));
}

interface BeautonomiGateModalProps {
  holdId: string;
  /** From `POST /api/public/booking-holds` — shows the same countdown as checkout while the user signs in. */
  holdExpiresAt?: string | null;
  open: boolean;
  onClose?: () => void;
  onAuthComplete: () => void;
  redirectUrl?: string;
}

export function BeautonomiGateModal({
  holdId,
  holdExpiresAt,
  open,
  onClose,
  onAuthComplete,
  redirectUrl: customRedirectUrl,
}: BeautonomiGateModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState<"email" | "phone" | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [sentPhoneE164, setSentPhoneE164] = useState<string>("");
  const [socialAuth, setSocialAuth] = useState<{ google: boolean; apple: boolean }>({
    google: true,
    apple: true,
  });
  const [marketingConsent, setMarketingConsent] = useState(false);

  const { bundle: configBundle } = useConfigBundle();
  const authPolicy = configBundle?.auth ?? DEFAULT_PUBLIC_AUTH;
  const emailOtpLen = authPolicy.email_otp_length;
  const emailOtpExpiryMin = Math.max(1, Math.round(authPolicy.email_otp_expiration_seconds / 60));
  const smsOtpLen = authPolicy.sms_otp_length;
  const smsOtpExpiryMin = Math.max(1, Math.round(authPolicy.sms_otp_expiration_seconds / 60));

  const hasSocial = socialAuth.google || socialAuth.apple;
  const validEmail = email.trim() !== "" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    if (!open || !holdExpiresAt?.trim()) {
      setHoldSecondsLeft(null);
      return;
    }
    const tick = () => setHoldSecondsLeft(holdSecondsRemaining(holdExpiresAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [open, holdExpiresAt]);

  useEffect(() => {
    getSocialAuthConfig().then(setSocialAuth).catch(() => {
      setSocialAuth({ google: true, apple: true });
    });
  }, []);

  useEffect(() => {
    if (!authPolicy.email_provider_enabled && otpSent === "email") {
      setOtpSent(null);
      setOtpCode("");
    }
  }, [authPolicy.email_provider_enabled, otpSent]);

  useEffect(() => {
    if (!authPolicy.phone_provider_enabled && otpSent === "phone") {
      setOtpSent(null);
      setOtpCode("");
    }
  }, [authPolicy.phone_provider_enabled, otpSent]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const postLoginNext = resolveGatePostLoginNext(customRedirectUrl, holdId);
  const redirectUrl = customRedirectUrl || `${origin}${postLoginNext}`;
  const oauthCallbackUrl = `${origin || ""}/auth/callback?next=${encodeURIComponent(postLoginNext)}`;

  const handleSocialOAuth = async (provider: "google" | "apple") => {
    setLoading(provider);
    try {
      if (typeof document !== "undefined" && holdId) {
        document.cookie = `beautonomi_hold_id=${holdId}; path=/; max-age=600; SameSite=Lax`;
      }
      if (typeof window !== "undefined") {
        sessionStorage.setItem(PENDING_MARKETING_CONSENT_KEY, marketingConsent ? "1" : "0");
      }
      await signInWithOAuth(provider, oauthCallbackUrl);
      onAuthComplete();
    } catch (err) {
      clearBeautonomiHoldIdCookie();
      console.error("OAuth error:", err);
      toast.error(err instanceof Error ? err.message : "Sign in failed");
      setLoading(null);
    } finally {
      setLoading(null);
    }
  };

  const handleEmailOtp = async () => {
    if (!authPolicy.email_provider_enabled) {
      toast.error("Email sign-in is not available for this platform.");
      return;
    }
    if (!email.trim()) {
      toast.error("Please enter your email");
      return;
    }
    setLoading("email");
    try {
      await sendAuthOtp({ email: email.trim() });
      setOtpCode("");
      setOtpSent("email");
      toast.success(
        `Check your email for the ${emailOtpLen}-digit code (valid about ${emailOtpExpiryMin} minutes).`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setLoading(null);
    }
  };

  const handlePhoneOtp = async () => {
    if (!authPolicy.phone_provider_enabled) {
      toast.error("Phone sign-in is not available for this platform.");
      return;
    }
    if (!phone.trim()) {
      toast.error("Please enter your phone number");
      return;
    }
    const e164 = phone.trim();
    if (!isCompleteE164(e164)) {
      toast.error("Please enter a valid phone number with country code.");
      return;
    }
    setLoading("phone");
    try {
      await sendAuthOtp({ phone: normalizeSupabaseAuthPhone(e164) });
      setOtpCode("");
      setSentPhoneE164(normalizeSupabaseAuthPhone(e164));
      setOtpSent("phone");
      toast.success(
        `Check your phone for the ${smsOtpLen}-digit code (valid about ${smsOtpExpiryMin} ${smsOtpExpiryMin === 1 ? "minute" : "minutes"}).`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(null);
    }
  };

  const handleVerifyOtp = async (codeOverride?: string) => {
    if (!otpSent) return;
    const token = normalizeSupabaseSmsOtpToken(codeOverride ?? otpCode);
    const codeOk =
      otpSent === "email"
        ? isCompleteOtpForLength(token, emailOtpLen)
        : isCompleteOtpForLength(token, smsOtpLen);
    if (!codeOk) {
      toast.error(
        otpSent === "email"
          ? `Enter the ${emailOtpLen}-digit code from your email`
          : `Enter the ${smsOtpLen}-digit code from your SMS`,
      );
      return;
    }

    setLoading("verify");
    try {
      if (otpSent === "email") {
        await verifyAuthOtp({ email: email.trim(), token, type: "email" });
      } else {
        await verifyAuthOtp({
          phone: normalizeSupabaseAuthPhone(sentPhoneE164),
          token,
          type: "sms",
        });
      }
      await submitMarketingConsent(marketingConsent);
      if (holdId && typeof document !== "undefined") {
        document.cookie = `beautonomi_hold_id=${holdId}; path=/; max-age=600; SameSite=Lax`;
      }
      window.location.href = redirectUrl;
      onAuthComplete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setLoading(null);
    }
  };

  const contentStyle = {
    background: "#ffffff",
    border: `1px solid ${BOOKING_EDGE}`,
    borderRadius: "32px",
    boxShadow: BOOKING_SHADOW_MAIN,
    color: BOOKING_TEXT_PRIMARY,
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          clearBeautonomiHoldIdCookie();
          onClose?.();
        }
      }}
    >
      <DialogContent
        className="sm:max-w-[430px] w-[95vw] p-6 sm:p-8 rounded-[32px] border-0 gap-0 max-h-[90vh] overflow-y-auto min-[640px]:my-8"
        style={contentStyle}
      >
        <DialogHeader className="text-left space-y-1.5 pb-6">
          <DialogTitle
            className="text-2xl font-semibold tracking-tight"
            style={{ color: BOOKING_TEXT_PRIMARY }}
          >
            Secure your slot
          </DialogTitle>
          <DialogDescription
            className="text-sm mt-0"
            style={{ color: BOOKING_TEXT_SECONDARY }}
          >
            Great choice! To secure this slot and save your booking history, please sign in or create your Beautonomi profile.
          </DialogDescription>
          {holdExpiresAt && holdSecondsLeft != null && (
            <div
              className="mt-3 rounded-xl border px-3 py-2.5 text-sm flex items-center gap-2"
              style={{
                borderColor: BOOKING_BORDER,
                backgroundColor:
                  holdSecondsLeft <= 0
                    ? "rgba(254, 242, 242, 0.95)"
                    : holdSecondsLeft < 120
                      ? "rgba(255, 251, 235, 0.95)"
                      : "rgba(239, 246, 255, 0.95)",
              }}
              role="status"
            >
              <Clock className="h-4 w-4 shrink-0" style={{ color: BOOKING_ACCENT }} aria-hidden />
              {holdSecondsLeft <= 0 ? (
                <span style={{ color: "#991b1b" }}>This slot hold has expired. Close and choose another time.</span>
              ) : (
                <span style={{ color: BOOKING_TEXT_PRIMARY }}>
                  Slot held for{" "}
                  <span className="tabular-nums font-semibold">
                    {Math.floor(holdSecondsLeft / 60)}:{String(holdSecondsLeft % 60).padStart(2, "0")}
                  </span>
                  . Finish signing in to continue.
                </span>
              )}
            </div>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <MarketingConsentCheckbox
            id="gate-marketing-consent"
            checked={marketingConsent}
            onCheckedChange={setMarketingConsent}
            className="flex items-start gap-3"
          />
          {socialAuth.google && (
            <Button
              variant="outline"
              className={`w-full rounded-2xl h-12 font-medium ${MIN_TAP} ${BOOKING_ACTIVE_SCALE} flex items-center justify-center gap-3`}
              style={{
                borderColor: BOOKING_BORDER,
                color: BOOKING_TEXT_PRIMARY,
                backgroundColor: "#fff",
              }}
              onClick={() => void handleSocialOAuth("google")}
              disabled={!!loading}
            >
              {loading === "google" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Image src="/images/google.svg" alt="" width={20} height={20} className="shrink-0" />
              )}
              Continue with Google
            </Button>
          )}
          {socialAuth.apple && (
            <Button
              variant="outline"
              className={`w-full rounded-2xl h-12 font-medium ${MIN_TAP} ${BOOKING_ACTIVE_SCALE} flex items-center justify-center gap-3`}
              style={{
                borderColor: BOOKING_BORDER,
                color: BOOKING_TEXT_PRIMARY,
                backgroundColor: "#fff",
              }}
              onClick={() => void handleSocialOAuth("apple")}
              disabled={!!loading}
            >
              {loading === "apple" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Image src="/images/apple-icon.svg" alt="" width={20} height={20} className="shrink-0" />
              )}
              Continue with Apple
            </Button>
          )}
          {!otpSent ? (
            <>
              {hasSocial && (authPolicy.email_provider_enabled || authPolicy.phone_provider_enabled) && (
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" style={{ borderColor: BOOKING_BORDER }} />
                  </div>
                  <div className="relative flex justify-center">
                    <span
                      className="px-3 text-xs font-medium uppercase tracking-wider bg-white"
                      style={{ color: BOOKING_TEXT_SECONDARY }}
                    >
                      Or
                    </span>
                  </div>
                </div>
              )}
              {authPolicy.email_provider_enabled && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
                    Email ({emailOtpLen}-digit code)
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="rounded-xl h-12 border bg-gray-50/50 focus-visible:ring-2 focus-visible:ring-offset-0 pr-10"
                        style={{ borderColor: BOOKING_BORDER, outlineColor: BOOKING_ACCENT }}
                        autoComplete="email"
                      />
                      {email.trim() !== "" && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          {validEmail ? <Check className="h-5 w-5 text-green-600" aria-hidden /> : <X className="h-5 w-5 text-red-600" aria-hidden />}
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      className={`rounded-xl h-12 px-4 ${MIN_TAP} ${BOOKING_ACTIVE_SCALE}`}
                      style={{
                        backgroundColor: BOOKING_ACCENT,
                        color: "#fff",
                        border: `1px solid ${BOOKING_EDGE}`,
                        boxShadow: BOOKING_SHADOW_CARD,
                      }}
                      onClick={handleEmailOtp}
                      disabled={!!loading}
                    >
                      {loading === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs" style={{ color: BOOKING_TEXT_SECONDARY }}>
                    We&apos;ll email you a {emailOtpLen}-digit verification code
                  </p>
                </div>
              )}
              {authPolicy.phone_provider_enabled && (
                <>
                  {(authPolicy.email_provider_enabled || hasSocial) && (
                    <div className="relative py-1">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" style={{ borderColor: BOOKING_BORDER }} />
                      </div>
                      <div className="relative flex justify-center">
                        <span
                          className="px-3 text-xs font-medium uppercase tracking-wider bg-white"
                          style={{ color: BOOKING_TEXT_SECONDARY }}
                        >
                          Or
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
                      Phone (SMS code)
                    </Label>
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 min-w-0">
                        <PhoneInput
                          inputId="beautonomi-gate-phone"
                          label=""
                          value={phone}
                          onChange={setPhone}
                          placeholder="Phone number"
                        />
                      </div>
                      <Button
                        type="button"
                        className={`rounded-xl h-12 px-4 shrink-0 mt-0 ${MIN_TAP} ${BOOKING_ACTIVE_SCALE}`}
                        style={{
                          backgroundColor: BOOKING_ACCENT,
                          color: "#fff",
                          border: `1px solid ${BOOKING_EDGE}`,
                          boxShadow: BOOKING_SHADOW_CARD,
                        }}
                        onClick={handlePhoneOtp}
                        disabled={!!loading || !isCompleteE164(phone)}
                      >
                        {loading === "phone" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: BOOKING_TEXT_SECONDARY }}>
                      Pick country, then enter national digits (hint under the field). We&apos;ll SMS a {smsOtpLen}
                      -digit code (valid about {smsOtpExpiryMin} {smsOtpExpiryMin === 1 ? "minute" : "minutes"}).
                    </p>
                  </div>
                </>
              )}
            </>
          ) : otpSent === "phone" ? (
            <div className="space-y-3">
              <Label className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
                Enter verification code
              </Label>
              <p className="text-xs" style={{ color: BOOKING_TEXT_SECONDARY }}>
                Enter the {smsOtpLen}-digit code we sent by SMS.
              </p>
              <OtpDigitInput
                length={smsOtpLen}
                value={otpCode}
                onChange={setOtpCode}
                onComplete={(code) => {
                  if (!loading && isCompleteOtpForLength(code, smsOtpLen)) void handleVerifyOtp(code);
                }}
                disabled={!!loading}
                autoFocus
                label="SMS verification code"
              />
              <Button
                type="button"
                className={`w-full rounded-2xl h-12 font-semibold ${MIN_TAP} ${BOOKING_ACTIVE_SCALE}`}
                style={{
                  backgroundColor: BOOKING_ACCENT,
                  color: "#fff",
                  borderRadius: BOOKING_RADIUS_BUTTON,
                  boxShadow: BOOKING_SHADOW_CARD,
                }}
                onClick={() => void handleVerifyOtp()}
                disabled={!!loading || !isCompleteOtpForLength(otpCode, smsOtpLen)}
              >
                {loading === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-sm touch-manipulation"
                style={{ color: BOOKING_TEXT_SECONDARY }}
                onClick={() => { setOtpSent(null); setOtpCode(""); }}
              >
                Use different method
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Label className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
                Enter verification code
              </Label>
              <p className="text-xs" style={{ color: BOOKING_TEXT_SECONDARY }}>
                Enter the {emailOtpLen}-digit code we sent to{" "}
                <span className="font-semibold text-gray-900">{email.trim()}</span>
              </p>
              <OtpDigitInput
                length={emailOtpLen}
                value={otpCode}
                onChange={setOtpCode}
                onComplete={(code) => {
                  if (!loading && isCompleteOtpForLength(code, emailOtpLen)) void handleVerifyOtp(code);
                }}
                disabled={!!loading}
                autoFocus
                label="Email verification code"
              />
              <Button
                type="button"
                className={`w-full rounded-2xl h-12 font-semibold ${MIN_TAP} ${BOOKING_ACTIVE_SCALE}`}
                style={{
                  backgroundColor: BOOKING_ACCENT,
                  color: "#fff",
                  borderRadius: BOOKING_RADIUS_BUTTON,
                  boxShadow: BOOKING_SHADOW_CARD,
                }}
                onClick={() => void handleVerifyOtp()}
                disabled={!!loading || !isCompleteOtpForLength(otpCode, emailOtpLen)}
              >
                {loading === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-sm touch-manipulation"
                style={{ color: BOOKING_TEXT_SECONDARY }}
                onClick={() => {
                  setOtpSent(null);
                  setOtpCode("");
                }}
              >
                Use different method
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
