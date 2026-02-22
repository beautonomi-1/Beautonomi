"use client";

import { useState } from "react";
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
import { Loader2, Mail, Smartphone } from "lucide-react";
import { toast } from "sonner";

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
  const [otpSent, setOtpSent] = useState<"email" | "phone" | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [sentPhoneE164, setSentPhoneE164] = useState<string>("");

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
    const normalized = phone.trim().replace(/\D/g, "");
    if (normalized.length < 10) {
      toast.error("Please enter a valid phone number");
      return;
    }
    const e164 = `+${normalized.startsWith("27") ? normalized : "27" + normalized}`;
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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose?.()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Secure your slot</DialogTitle>
          <DialogDescription>
            Great choice! To secure this slot and save your booking history, please sign in or create your Beautonomi profile.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOAuth("google")}
            disabled={!!loading}
          >
            {loading === "google" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue with Google
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOAuth("apple")}
            disabled={!!loading}
          >
            {loading === "apple" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue with Apple
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleOAuth("facebook")}
            disabled={!!loading}
          >
            {loading === "facebook" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue with Facebook
          </Button>

          {!otpSent ? (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Email (magic link)</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={handleEmailOtp}
                    disabled={!!loading}
                  >
                    {loading === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">We&apos;ll send you a sign-in link</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Phone (SMS code)</Label>
                <div className="flex gap-2">
                  <Input
                    type="tel"
                    placeholder="082 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={handlePhoneOtp}
                    disabled={!!loading}
                  >
                    {loading === "phone" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Enter SA number with or without +27</p>
              </div>
            </>
          ) : otpSent === "phone" ? (
            <div className="space-y-2">
              <Label className="text-sm">Enter verification code</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleVerifyOtp} disabled={!!loading || !otpCode.trim()}>
                  {loading === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => { setOtpSent(null); setOtpCode(""); }}
              >
                Use different method
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">
              Check your email and click the link to sign in. You can close this and we&apos;ll redirect you when ready.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
