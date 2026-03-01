"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithOAuth } from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Mail, Smartphone, Check, X } from "lucide-react";
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
import {
  normalizePhoneToE164,
  DEFAULT_PHONE_COUNTRY_CODE,
  PHONE_COUNTRY_OPTIONS,
  getFlagEmoji,
} from "@/lib/phone";

interface BeautonomiGateModalProps {
  holdId: string;
  open: boolean;
  onClose?: () => void;
  onAuthComplete: () => void;
  redirectUrl?: string;
}

export function BeautonomiGateModal({
  holdId,
  open,
  onClose,
  onAuthComplete,
  redirectUrl: customRedirectUrl,
}: BeautonomiGateModalProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState(DEFAULT_PHONE_COUNTRY_CODE);
  const [otpSent, setOtpSent] = useState<"email" | "phone" | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [sentPhoneE164, setSentPhoneE164] = useState<string>("");

  const validEmail = email.trim() !== "" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const normalizedPhone = normalizePhoneToE164(phone, phoneCountryCode);

  const redirectUrl =
    customRedirectUrl ||
    `${typeof window !== "undefined" ? window.location.origin : ""}/book/continue?hold_id=${holdId}`;

  const handleOAuth = async (provider: "google" | "facebook" | "apple") => {
    setLoading(provider);
    try {
      if (typeof document !== "undefined" && holdId) {
        document.cookie = `beautonomi_hold_id=${holdId}; path=/; max-age=600; SameSite=Lax`;
      }
      await signInWithOAuth(provider, redirectUrl);
      onAuthComplete();
    } catch (err) {
      console.error("OAuth error:", err);
      toast.error(err instanceof Error ? err.message : "Sign in failed");
      setLoading(null);
    } finally {
      setLoading(null);
    }
  };

  const handleEmailOtp = async () => {
    if (!email.trim()) {
      toast.error("Please enter your email");
      return;
    }
    setLoading("email");
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectUrl },
      });
      if (error) throw error;
      setOtpSent("email");
      toast.success("Check your email for the sign-in link");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setLoading(null);
    }
  };

  const handlePhoneOtp = async () => {
    if (!phone.trim()) {
      toast.error("Please enter your phone number");
      return;
    }
    const e164 = normalizePhoneToE164(phone, phoneCountryCode);
    if (!e164) {
      toast.error("Please enter a valid phone number with country code (e.g. 082 123 4567 for SA)");
      return;
    }
    setLoading("phone");
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        phone: e164,
        options: { channel: "sms" },
      });
      if (error) throw error;
      setSentPhoneE164(e164);
      setOtpSent("phone");
      toast.success("Check your phone for the verification code");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(null);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) return;
    setLoading("verify");
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({
        ...(otpSent === "email"
          ? { email: email.trim(), token: otpCode.trim(), type: "email" }
          : { phone: sentPhoneE164, token: otpCode.trim(), type: "sms" }),
      });
      if (error) throw error;
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
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose?.()}>
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
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Button
            variant="outline"
            className={`w-full rounded-2xl h-12 font-medium ${MIN_TAP} ${BOOKING_ACTIVE_SCALE} flex items-center justify-center gap-3`}
            style={{
              borderColor: BOOKING_BORDER,
              color: BOOKING_TEXT_PRIMARY,
              backgroundColor: "#fff",
            }}
            onClick={() => handleOAuth("google")}
            disabled={!!loading}
          >
            {loading === "google" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Image src="/images/google.svg" alt="" width={20} height={20} className="shrink-0" />
            )}
            Continue with Google
          </Button>
          <Button
            variant="outline"
            className={`w-full rounded-2xl h-12 font-medium ${MIN_TAP} ${BOOKING_ACTIVE_SCALE} flex items-center justify-center gap-3`}
            style={{
              borderColor: BOOKING_BORDER,
              color: BOOKING_TEXT_PRIMARY,
              backgroundColor: "#fff",
            }}
            onClick={() => handleOAuth("apple")}
            disabled={!!loading}
          >
            {loading === "apple" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Image src="/images/apple-icon.svg" alt="" width={20} height={20} className="shrink-0" />
            )}
            Continue with Apple
          </Button>
          <Button
            variant="outline"
            className={`w-full rounded-2xl h-12 font-medium ${MIN_TAP} ${BOOKING_ACTIVE_SCALE} flex items-center justify-center gap-3`}
            style={{
              borderColor: BOOKING_BORDER,
              color: BOOKING_TEXT_PRIMARY,
              backgroundColor: "#fff",
            }}
            onClick={() => handleOAuth("facebook")}
            disabled={!!loading}
          >
            {loading === "facebook" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Image src="/images/facebook-icon.svg" alt="" width={20} height={20} className="shrink-0" />
            )}
            Continue with Facebook
          </Button>

          {!otpSent ? (
            <>
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
              <div className="space-y-2">
                <Label className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
                  Email (magic link)
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
                  We&apos;ll send you a sign-in link
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
                  Phone (SMS code)
                </Label>
                <div className="flex gap-2">
                  <select
                    aria-label="Country code"
                    value={phoneCountryCode}
                    onChange={(e) => setPhoneCountryCode(e.target.value)}
                    className="rounded-xl h-12 pl-2 pr-8 border bg-gray-50/50 text-sm font-medium min-w-[100px] focus:outline-none focus:ring-2 shrink-0"
                    style={{ borderColor: BOOKING_BORDER, outlineColor: BOOKING_ACCENT }}
                  >
                    {PHONE_COUNTRY_OPTIONS.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {getFlagEmoji(opt.iso2)} {opt.dial}
                      </option>
                    ))}
                  </select>
                  <div className="relative flex-1">
                    <Input
                      type="tel"
                      placeholder={phoneCountryCode === "27" ? "82 123 4567" : "Phone"}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="rounded-xl h-12 border bg-gray-50/50 focus-visible:ring-2 focus-visible:ring-offset-0 pr-10"
                      style={{ borderColor: BOOKING_BORDER, outlineColor: BOOKING_ACCENT }}
                      autoComplete="tel-national"
                    />
                    {phone.trim() !== "" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        {normalizedPhone ? <Check className="h-5 w-5 text-green-600" aria-hidden /> : <X className="h-5 w-5 text-red-600" aria-hidden />}
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
                    onClick={handlePhoneOtp}
                    disabled={!!loading}
                  >
                    {loading === "phone" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs" style={{ color: BOOKING_TEXT_SECONDARY }}>
                  Enter number with or without country code (e.g. 082 for SA)
                </p>
              </div>
            </>
          ) : otpSent === "phone" ? (
            <div className="space-y-3">
              <Label className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
                Enter verification code
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="flex-1 rounded-xl h-12 border bg-gray-50/50 focus-visible:ring-2 focus-visible:ring-offset-0"
                  style={{ borderColor: BOOKING_BORDER, outlineColor: BOOKING_ACCENT }}
                />
                <Button
                  type="button"
                  className={`rounded-2xl h-12 font-semibold px-5 ${MIN_TAP} ${BOOKING_ACTIVE_SCALE}`}
                  style={{
                    backgroundColor: BOOKING_ACCENT,
                    color: "#fff",
                    borderRadius: BOOKING_RADIUS_BUTTON,
                    boxShadow: BOOKING_SHADOW_CARD,
                  }}
                  onClick={handleVerifyOtp}
                  disabled={!!loading || !otpCode.trim()}
                >
                  {loading === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                </Button>
              </div>
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
            <p className="text-sm text-center py-2" style={{ color: BOOKING_TEXT_SECONDARY }}>
              Check your email and click the link to sign in. You can close this and we&apos;ll redirect you when ready.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
