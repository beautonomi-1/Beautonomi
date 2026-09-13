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
import { appendBookingEmbedQuery, buildBookContinuePath } from "@beautonomi/utils";
import { isLikelyFramed, navigateForEmbedBreakout } from "@/lib/booking/embed-host";
import { completeCustomerOnboardingQuietly } from "@/lib/booking/complete-customer-onboarding";
import { useTranslation } from "@beautonomi/i18n";

function currentBookingEmbedFlag(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("embed") === "1";
}

function resolveGatePostLoginNext(customRedirectUrl: string | undefined, holdId: string): string {
  const embed = currentBookingEmbedFlag();
  const fallback = buildBookContinuePath(holdId, embed);
  const raw = customRedirectUrl?.trim();
  if (!raw) return fallback;
  if (isSafeRelativeRedirect(raw)) return appendBookingEmbedQuery(raw.trim(), embed);
  if (typeof window !== "undefined") {
    try {
      const u = new URL(raw, window.location.origin);
      if (u.origin === window.location.origin) {
        const pathWithQuery = `${u.pathname}${u.search}`;
        return appendBookingEmbedQuery(sanitizeRelativeRedirect(pathWithQuery) ?? fallback, embed);
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
  const { t } = useTranslation();
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
      const framed = isLikelyFramed();
      const data = await signInWithOAuth(provider, oauthCallbackUrl, {
        skipBrowserRedirect: framed,
      });
      if (framed && data?.url) {
        navigateForEmbedBreakout(data.url, "auth_required");
        return;
      }
      onAuthComplete();
    } catch (err) {
      clearBeautonomiHoldIdCookie();
      console.error("OAuth error:", err);
      toast.error(err instanceof Error ? err.message : t("web.book.gate.signInFailed"));
      setLoading(null);
    } finally {
      setLoading(null);
    }
  };

  const handleEmailOtp = async () => {
    if (!authPolicy.email_provider_enabled) {
      toast.error(t("web.book.gate.emailSignInUnavailable"));
      return;
    }
    if (!email.trim()) {
      toast.error(t("web.book.gate.enterEmail"));
      return;
    }
    setLoading("email");
    try {
      await sendAuthOtp({ email: email.trim() });
      setOtpCode("");
      setOtpSent("email");
      toast.success(
        t("web.book.gate.emailOtpSentToast", { digits: emailOtpLen, minutes: emailOtpExpiryMin }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("web.book.gate.emailSendFailed"));
    } finally {
      setLoading(null);
    }
  };

  const handlePhoneOtp = async () => {
    if (!authPolicy.phone_provider_enabled) {
      toast.error(t("web.book.gate.phoneSignInUnavailable"));
      return;
    }
    if (!phone.trim()) {
      toast.error(t("web.book.gate.enterPhone"));
      return;
    }
    const e164 = phone.trim();
    if (!isCompleteE164(e164)) {
      toast.error(t("web.book.gate.enterValidPhone"));
      return;
    }
    setLoading("phone");
    try {
      await sendAuthOtp({ phone: normalizeSupabaseAuthPhone(e164) });
      setOtpCode("");
      setSentPhoneE164(normalizeSupabaseAuthPhone(e164));
      setOtpSent("phone");
      toast.success(
        t("web.book.gate.smsOtpSentToast", {
          digits: smsOtpLen,
          minutes: smsOtpExpiryMin,
          minuteLabel: smsOtpExpiryMin === 1 ? t("web.book.gate.minute") : t("web.book.gate.minutes"),
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("web.book.gate.smsSendFailed"));
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
          ? t("web.book.gate.enterEmailCode", { digits: emailOtpLen })
          : t("web.book.gate.enterSmsCode", { digits: smsOtpLen }),
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
      await completeCustomerOnboardingQuietly();
      if (holdId && typeof document !== "undefined") {
        document.cookie = `beautonomi_hold_id=${holdId}; path=/; max-age=600; SameSite=Lax`;
      }
      // Full reload inside a third-party iframe drops the in-memory session when
      // the browser blocks partitioned cookies (Safari). Stay in the SPA instead.
      if (isLikelyFramed()) {
        onAuthComplete();
        return;
      }
      window.location.href = redirectUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("web.book.gate.invalidCode"));
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
        <DialogHeader className="text-start space-y-1.5 pb-6">
          <DialogTitle
            className="text-2xl font-semibold tracking-tight"
            style={{ color: BOOKING_TEXT_PRIMARY }}
          >
            {t("web.book.gate.title")}
          </DialogTitle>
          <DialogDescription
            className="text-sm mt-0"
            style={{ color: BOOKING_TEXT_SECONDARY }}
          >
            {t("web.book.gate.description")}
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
                <span style={{ color: "#991b1b" }}>{t("web.book.gate.holdExpired")}</span>
              ) : (
                <span style={{ color: BOOKING_TEXT_PRIMARY }}>
                  {t("web.book.gate.slotHeldFor")}{" "}
                  <span className="tabular-nums font-semibold">
                    {Math.floor(holdSecondsLeft / 60)}:{String(holdSecondsLeft % 60).padStart(2, "0")}
                  </span>
                  . {t("web.book.gate.finishSigningIn")}
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
              {t("web.book.gate.continueGoogle")}
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
              {t("web.book.gate.continueApple")}
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
{t("web.book.gate.or")}
                    </span>
                  </div>
                </div>
              )}
              {authPolicy.email_provider_enabled && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
                    {t("web.book.gate.emailOtpLabel", { digits: emailOtpLen })}
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type="email"
                        placeholder={t("web.book.engine.emailPlaceholder")}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="rounded-xl h-12 border bg-gray-50/50 focus-visible:ring-2 focus-visible:ring-offset-0 pe-10"
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
                    {t("web.book.gate.emailOtpHint", { digits: emailOtpLen })}
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
    {t("web.book.gate.or")}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
                      {t("web.book.gate.phoneSmsLabel")}
                    </Label>
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 min-w-0">
                        <PhoneInput
                          inputId="beautonomi-gate-phone"
                          label=""
                          value={phone}
                          onChange={setPhone}
                          placeholder={t("web.book.gate.phonePlaceholder")}
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
                      {t("web.book.gate.phoneOtpHint", {
                        digits: smsOtpLen,
                        minutes: smsOtpExpiryMin,
                        minuteLabel: smsOtpExpiryMin === 1 ? t("web.book.gate.minute") : t("web.book.gate.minutes"),
                      })}
                    </p>
                  </div>
                </>
              )}
            </>
          ) : otpSent === "phone" ? (
            <div className="space-y-3">
              <Label className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
                {t("web.book.gate.enterVerificationCode")}
              </Label>
              <p className="text-xs" style={{ color: BOOKING_TEXT_SECONDARY }}>
                {t("web.book.gate.smsCodeHint", { digits: smsOtpLen })}
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
                label={t("web.book.gate.smsVerificationLabel")}
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
                {loading === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("web.book.gate.verify")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-sm touch-manipulation"
                style={{ color: BOOKING_TEXT_SECONDARY }}
                onClick={() => { setOtpSent(null); setOtpCode(""); }}
              >
                {t("web.book.gate.useDifferentMethod")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Label className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
{t("web.book.gate.enterVerificationCode")}
              </Label>
              <p className="text-xs" style={{ color: BOOKING_TEXT_SECONDARY }}>
                {t("web.book.gate.emailCodeHint", { digits: emailOtpLen })}{" "}
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
                label={t("web.book.gate.emailVerificationLabel")}
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
                {loading === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("web.book.gate.verify")}
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
{t("web.book.gate.useDifferentMethod")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
