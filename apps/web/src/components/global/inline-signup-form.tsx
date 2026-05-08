"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FaApple, FaGoogle } from "react-icons/fa6";
import { CiMail } from "react-icons/ci";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import {
  signIn as signInAuth,
  signUp as signUpAuth,
  signInWithOAuth,
  resendVerificationEmail,
  buildEmailConfirmationRedirectUrl,
} from "@/lib/supabase/auth";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { supportedLanguages, SIGNUP_SOURCE_OPTIONS } from "@beautonomi/i18n";
import { PLATFORM_CONTACT_HREF } from "@/lib/routes/platform-contact";
import { RADIX_SELECT_NONE } from "@/lib/ui/select-radix-sentinels";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";
import { getSocialAuthConfig } from "@/lib/social-auth-config";

const PENDING_SIGNUP_SOURCE_KEY = "beautonomi_pending_signup_source";
const PENDING_PREFERRED_LANGUAGE_KEY = "beautonomi_pending_preferred_language";

interface InlineSignupFormProps {
  redirectContext?: "provider" | "customer";
  /** Optional extra work after redirect (e.g. close a parent modal). Does not replace default navigation. */
  onAuthSuccess?: () => void;
  redirectUrl?: string;
  /** Referral code from signup?ref=CODE — attached after signup for attribution */
  referralCode?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Weak", color: "bg-red-500" };
  if (score <= 2) return { score, label: "Fair", color: "bg-amber-500" };
  if (score <= 3) return { score, label: "Good", color: "bg-blue-500" };
  return { score, label: "Strong", color: "bg-green-500" };
}

export default function InlineSignupForm({ redirectContext, onAuthSuccess, redirectUrl, referralCode }: InlineSignupFormProps) {
  const router = useRouter();
  const { refreshUser, role: _contextRole, user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);
  /** Same UX as LoginModal — replaces signup steps after email-confirmation-required signup. */
  const [awaitingEmailVerification, setAwaitingEmailVerification] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState(() => {
    if (typeof navigator !== "undefined" && navigator.language) {
      const code = navigator.language.split("-")[0];
      return supportedLanguages.some((l) => l.code === code) ? code : "en";
    }
    return "en";
  });
  const [signupSource, setSignupSource] = useState<string | null>(null);
  const [socialAuth, setSocialAuth] = useState<{ google: boolean; apple: boolean }>({
    google: true,
    apple: true,
  });
  const { t } = useTranslation();
  const fieldClass = "bg-gray-100 border-gray-200 text-[13px] text-gray-700 placeholder:text-gray-400";
  const labelClass = "text-xs font-medium text-gray-700 mb-2 block";

  // Apply pending signup_source / preferred_language when user becomes available (e.g. after email verification)
  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;
    const pendingSource = sessionStorage.getItem(PENDING_SIGNUP_SOURCE_KEY);
    const pendingLang = sessionStorage.getItem(PENDING_PREFERRED_LANGUAGE_KEY);
    if (!pendingSource && !pendingLang) return;
    const payload: { signup_source?: string; preferred_language?: string } = {};
    if (pendingSource) payload.signup_source = pendingSource;
    if (pendingLang) payload.preferred_language = pendingLang;
    fetcher.patch("/api/me/profile", payload).then(() => {
      sessionStorage.removeItem(PENDING_SIGNUP_SOURCE_KEY);
      sessionStorage.removeItem(PENDING_PREFERRED_LANGUAGE_KEY);
    }).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    getSocialAuthConfig().then(setSocialAuth).catch(() => {
      setSocialAuth({ google: true, apple: true });
    });
  }, []);

  // Close form and call onAuthSuccess when user becomes authenticated
  useEffect(() => {
    if (user && onAuthSuccess) {
      setTimeout(() => {
        onAuthSuccess();
      }, 300);
    }
  }, [user, onAuthSuccess]);

  // After login/signup: attach referral if ref was stored (e.g. from email verification return)
  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;
    const storedRef = sessionStorage.getItem("referral_ref");
    if (!storedRef?.trim()) return;
    sessionStorage.removeItem("referral_ref");
    fetcher.post("/api/me/referrals/attach", { referral_code: storedRef.trim() }).catch(() => {});
  }, [user?.id]);

  const handleEmailContinue = () => {
    setAwaitingEmailVerification(false);
    setError(null);
    if (!fullName?.trim()) {
      setError("Full name is required");
      return;
    }
    if (!email?.trim()) {
      setError("Email is required");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }
    setShowPasswordField(true);
  };

  const handleEmailAuth = async () => {
    setError(null);
    setShowResendVerification(false);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!fullName?.trim()) {
      setError("Full name is required");
      return;
    }
    if (!trimmedEmail) {
      setError("Email is required");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("Please enter a valid email address");
      return;
    }
    if (!trimmedPassword) {
      setError("Password is required");
      return;
    }
    if (trimmedPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    const strength = getPasswordStrength(trimmedPassword);
    if (strength.score < 2) {
      setError("Use a stronger password (add uppercase, numbers, or symbols)");
      return;
    }
    if (!agreeTerms) {
      setError(
        "Please confirm you have read and agree to the Terms of Service and Privacy Policy (including product analytics and optional session replay while signed in)."
      );
      return;
    }
    if (phone?.trim() && !isCompleteE164(phone)) {
      setError("Enter a valid phone number or clear the phone field.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setShowResendVerification(false);

    if (referralCode?.trim() && typeof window !== "undefined") {
      sessionStorage.setItem("referral_ref", referralCode.trim());
    }

    try {

      const userRole = redirectContext === "provider" ? "provider_owner" : "customer";

      const signupResult = await signUpAuth({
        email: trimmedEmail,
        password: trimmedPassword,
        fullName: fullName?.trim(),
        phone: phone?.trim() && isCompleteE164(phone) ? phone.trim() : undefined,
        role: userRole,
        emailRedirectTo: buildEmailConfirmationRedirectUrl({ redirectContext, redirectUrl }),
      });

      if (signupResult?.session) {
        toast.success("Account created successfully! Welcome to Beautonomi.");
        await refreshUser();
        try {
          await fetcher.patch("/api/me/profile", {
            signup_source: signupSource || undefined,
            preferred_language: preferredLanguage,
          });
        } catch {
          // Non-blocking
        }
        if (referralCode?.trim()) {
          try {
            await fetcher.post("/api/me/referrals/attach", { referral_code: referralCode.trim() });
          } catch {
            // Non-blocking; attribution may already be set
          }
        }
        await new Promise(resolve => setTimeout(resolve, 300));

        if (redirectContext === "provider") {
          router.push("/provider/onboarding");
        } else if (redirectUrl) {
          router.push(redirectUrl);
        } else {
          router.push("/onboarding");
        }
        onAuthSuccess?.();
      } else if (signupResult?.user) {
        try {
          const loginResult = await signInAuth({ email: trimmedEmail, password: trimmedPassword });
          
          if (loginResult?.session) {
            toast.success("Account created successfully! Welcome to Beautonomi.");
            await refreshUser();
            try {
              await fetcher.patch("/api/me/profile", {
                signup_source: signupSource || undefined,
                preferred_language: preferredLanguage,
              });
            } catch {
              // Non-blocking
            }
            if (referralCode?.trim()) {
              try {
                await fetcher.post("/api/me/referrals/attach", { referral_code: referralCode.trim() });
              } catch {
                // Non-blocking
              }
            }
            await new Promise(resolve => setTimeout(resolve, 300));

            if (redirectContext === "provider") {
              router.push("/provider/onboarding");
            } else if (redirectUrl) {
              router.push(redirectUrl);
            } else {
              router.push("/onboarding");
            }
            onAuthSuccess?.();
          } else {
            throw new Error("Email verification required");
          }
        } catch (loginError: any) {
          console.log("Auto-login after signup failed, email verification is required:", loginError);
          if (typeof window !== "undefined") {
            if (signupSource) sessionStorage.setItem(PENDING_SIGNUP_SOURCE_KEY, signupSource);
            sessionStorage.setItem(PENDING_PREFERRED_LANGUAGE_KEY, preferredLanguage);
          }
          setPassword("");
          setShowPasswordField(false);
          setShowResendVerification(true);
          setError(null);
          setAwaitingEmailVerification(true);
          toast.success(
            redirectContext === "provider"
              ? "Check your email — verify your account, then sign in to continue."
              : "Check your email to verify your account, then sign in.",
            { duration: 4500 },
          );
        }
      } else {
        throw new Error("Failed to create account. Please try again.");
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      const errorMessage = error.message || "Authentication failed. Please try again.";
      const lowerErrorMessage = errorMessage.toLowerCase();
      
      if (lowerErrorMessage.includes("email not confirmed") || 
          lowerErrorMessage.includes("email_not_confirmed") ||
          lowerErrorMessage.includes("verify your email")) {
        setError("Please verify your email address before logging in. Check your inbox for the verification email.");
        setShowResendVerification(true);
      } else if (lowerErrorMessage.includes("invalid login credentials") || 
                 lowerErrorMessage.includes("invalid credentials")) {
        setError("Invalid login credentials. Please check your email and password.");
        setShowResendVerification(true);
      } else {
        setError(errorMessage);
        if (lowerErrorMessage.includes("email")) {
          setShowResendVerification(true);
        } else {
          setShowResendVerification(false);
        }
      }
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      toast.error("Please enter your email address first");
      return;
    }

    setIsResendingVerification(true);
    try {
      await resendVerificationEmail(
        email.trim(),
        buildEmailConfirmationRedirectUrl({ redirectContext, redirectUrl }),
      );
      toast.success("Verification email sent! Please check your inbox and spam folder.");
      setShowResendVerification(false);
    } catch (error: any) {
      console.error("Error resending verification email:", error);
      const errorMessage = error.message || "Failed to send verification email.";
      const lowerError = errorMessage.toLowerCase();
      if (lowerError.includes("user not found") || 
          lowerError.includes("email not found") ||
          lowerError.includes("no user found")) {
        toast.error("No account found with this email address. Please check your email or sign up.");
      } else if (lowerError.includes("already verified") || 
                 lowerError.includes("email already confirmed")) {
        toast.error("This email is already verified. Please check your password or try signing in again.");
        setShowResendVerification(false);
      } else {
        toast.error(errorMessage + " Please try again.");
      }
    } finally {
      setIsResendingVerification(false);
    }
  };

  // §Customer-launch (audit 2026-04): phone sign-up was never actually
  // wired on this form — the stub surfaced a "coming soon" toast then
  // switched back to the email form, which confused new users.  The
  // "Continue with Phone" button has been removed, and any lingering
  // call-sites simply route the user to the email flow.
  const handlePhoneAuth = () => {
    setShowEmailForm(true);
  };

  const handleSocialOAuth = async (provider: "google" | "apple") => {
    setIsLoading(true);
    setError(null);

    try {
      const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
      await signInWithOAuth(provider, currentUrl);
      toast.info(
        provider === "google" ? "Redirecting to Google..." : "Redirecting to Apple...",
      );
    } catch (error: any) {
      console.error("OAuth error:", error);
      const label = provider === "google" ? "Google" : "Apple";
      setError(error.message || `Failed to sign in with ${label}`);
      toast.error(error.message || `Failed to sign in with ${label}`);
      setIsLoading(false);
    }
  };

  const signInHref = redirectContext === "provider" ? "/provider" : "/login";

  return (
    <div className="w-full">
      {showEmailForm && awaitingEmailVerification ? (
        <>
          <h2 className="text-xl sm:text-2xl font-bold mb-2">Check your email</h2>
          <p className="text-sm text-gray-500 mb-6 sm:mb-8">Confirm your address to continue</p>
        </>
      ) : (
        <h2 className="text-xl sm:text-2xl font-bold mb-6 sm:mb-8">Welcome to Beautonomi</h2>
      )}
      
      {/* Error Message */}
      {error && !awaitingEmailVerification && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-600">{error}</p>
              {showResendVerification && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600 mb-1">
                    If you haven't verified your email yet:
                  </p>
                  <button
                    onClick={handleResendVerification}
                    disabled={isResendingVerification}
                    className="text-sm text-blue-600 underline hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResendingVerification ? "Sending..." : "Resend verification email"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phone Input (Default) */}
      {!showEmailForm && (
        <>
          <div className="mb-4">
            <PhoneInput
              inputId="inline-signup-phone"
              label="Phone number"
              value={phone}
              onChange={setPhone}
              placeholder="Phone number"
              required
            />
          </div>
          
          <p className="text-xs text-gray-600 mb-6">
            {"We'll"} call or text you to confirm your number. Standard message and data rates apply.{" "}
            <Link href="/privacy-policy" className="font-semibold underline hover:text-primary">Privacy Policy</Link>
          </p>
          
          <Button 
            className="w-full bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white h-12 text-base font-medium mb-6"
            onClick={handlePhoneAuth}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : "Continue"}
          </Button>
        </>
      )}

      {showEmailForm && awaitingEmailVerification && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-7 sm:px-6 sm:py-8 mb-6">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
          </div>
          <p className="text-center text-[15px] font-semibold text-gray-900 mb-2">Almost there</p>
          <p className="text-center text-[13px] leading-relaxed text-gray-600 mb-4">
            We sent a verification link to:
          </p>
          <p className="text-center text-sm font-semibold text-gray-900 break-all mb-5 px-1">{email.trim()}</p>
          <p className="text-[13px] leading-relaxed text-gray-600 mb-6">
            {redirectContext === "provider" ? (
              <>
                Open the email and tap <strong className="font-semibold text-gray-800">Confirm</strong>. Then sign in with the same email and password — open{" "}
                <Link href="/provider" className="font-semibold text-primary underline">
                  Provider sign in
                </Link>{" "}
                from the Beautonomi home page.
              </>
            ) : (
              <>
                Open the email and confirm your address. Then{" "}
                <Link href="/login" className="font-semibold text-primary underline">
                  sign in
                </Link>{" "}
                with your email and password.
              </>
            )}
          </p>
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-2xl border-emerald-200 bg-white min-h-[48px] text-[15px] font-semibold"
              onClick={() => void handleResendVerification()}
              disabled={isResendingVerification || !email.trim()}
            >
              {isResendingVerification ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin inline" aria-hidden />
                  Sending…
                </>
              ) : (
                "Resend verification email"
              )}
            </Button>
            <Button
              className="inline-flex w-full rounded-2xl bg-gradient-to-r from-primary to-primary-hover text-white min-h-[48px] text-[15px] font-semibold shadow-lg shadow-pink-200/40"
              asChild
            >
              <Link href={signInHref}>I&apos;ve verified — Sign in</Link>
            </Button>
            <button
              type="button"
              className="w-full py-3 text-[15px] text-gray-600 hover:text-gray-900 font-medium rounded-xl active:bg-gray-100"
              onClick={() => {
                setAwaitingEmailVerification(false);
                setShowPasswordField(false);
                setPassword("");
                setError(null);
                setShowResendVerification(false);
              }}
            >
              Wrong email? Go back and edit
            </button>
          </div>
        </div>
      )}

      {/* Email Form */}
      {showEmailForm && !awaitingEmailVerification && (
        <>
          {/* Step 1: Email Input */}
          {!showPasswordField && (
            <>
              <div className="mb-4">
                <Label className={labelClass}>Full name</Label>
                <Input
                  type="text"
                  className={`${fieldClass} h-12`}
                  placeholder="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="mb-4">
                <Label className={labelClass}>Email</Label>
                <Input
                  type="email"
                  className={`${fieldClass} h-12`}
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
              <div className="mb-6">
                <Label className={labelClass}>{t("auth.preferredLanguage")}</Label>
                <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
                  <SelectTrigger className={`w-full h-12 rounded-lg ${fieldClass}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedLanguages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.nativeName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                className="w-full bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white h-12 text-base font-medium mb-6"
                onClick={handleEmailContinue}
                disabled={isLoading || !email?.trim() || !fullName?.trim()}
              >
                Continue
              </Button>
              
              {/* Separator */}
              <div className="flex items-center my-6">
                <div className="flex-grow border-t border-gray-300"></div>
                <span className="flex-shrink mx-4 text-sm text-gray-600">or</span>
                <div className="flex-grow border-t border-gray-300"></div>
              </div>

              {/* Social Login Options */}
              {socialAuth.google && (
                <Button
                  variant="outline"
                  className="w-full mb-3 flex items-center justify-start gap-3 px-4 h-12 hover:bg-gray-50 border-gray-300 text-base"
                  onClick={() => void handleSocialOAuth("google")}
                  disabled={isLoading}
                >
                  <FaGoogle className="text-lg" />
                  <span>Continue with Google</span>
                </Button>
              )}

              {socialAuth.apple && (
                <Button
                  variant="outline"
                  className="w-full mb-3 flex items-center justify-start gap-3 px-4 h-12 hover:bg-gray-50 border-gray-300 text-base"
                  onClick={() => void handleSocialOAuth("apple")}
                  disabled={isLoading}
                >
                  <FaApple className="text-lg" />
                  <span>Continue with Apple</span>
                </Button>
              )}

              {/*
                §Customer-launch (audit 2026-04): removed the "Continue with
                Phone" CTA — the underlying handler (handlePhoneAuth) was a
                toast-only stub that redirected back to the email form. The
                phone-OTP login still lives on /login for existing accounts.
              */}
              
              {/* Need help link */}
              <div className="text-center mt-6">
                <button
                  onClick={() => {
                    window.open(PLATFORM_CONTACT_HREF, "_blank");
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  Need help?
                </button>
              </div>
            </>
          )}

          {/* Step 2: Password Input */}
          {showPasswordField && (
            <>
              <div className="mb-4">
                <Label className={labelClass}>Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    className={`${fieldClass} h-12 pr-10`}
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) {
                        setError(null);
                        setShowResendVerification(false);
                      }
                    }}
                    autoComplete="new-password"
                    aria-describedby="password-strength"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 rounded p-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {password.length > 0 && (
                  <div id="password-strength" className="mt-2" role="status">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full ${i <= getPasswordStrength(password).score ? getPasswordStrength(password).color : "bg-gray-200"}`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Strength: {getPasswordStrength(password).label}
                      {getPasswordStrength(password).score < 2 && password.length >= 8 && (
                        <span className="text-amber-600"> — Add uppercase, numbers, or symbols</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
              <div className="mb-4">
                <Label className={labelClass}>
                  {t("auth.howHearAboutUs")} <span className="text-gray-500 font-normal">(optional)</span>
                </Label>
                <Select
                  value={signupSource ?? RADIX_SELECT_NONE}
                  onValueChange={(v) => setSignupSource(v === RADIX_SELECT_NONE ? null : v)}
                >
                  <SelectTrigger className={`w-full h-12 rounded-lg ${fieldClass}`}>
                    <SelectValue placeholder={t("auth.signupSourceSkip")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={RADIX_SELECT_NONE}>{t("auth.signupSourceSkip")}</SelectItem>
                    {SIGNUP_SOURCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mb-4 flex items-start gap-3">
                <Checkbox
                  id="signup-agree-terms"
                  checked={agreeTerms}
                  onCheckedChange={(c) => setAgreeTerms(c === true)}
                  className="mt-0.5"
                  aria-describedby="signup-terms-text"
                />
                <label htmlFor="signup-agree-terms" id="signup-terms-text" className="text-xs text-gray-600 cursor-pointer leading-relaxed">
                  I have read and agree to the{" "}
                  <Link href="/terms-and-condition" className="text-primary font-medium underline hover:no-underline" target="_blank" rel="noopener noreferrer">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy-policy" className="text-primary font-medium underline hover:no-underline" target="_blank" rel="noopener noreferrer">
                    Privacy Policy
                  </Link>
                  . I understand Beautonomi may use cookies and similar technologies, process personal data as described in the Privacy Policy, and (while I am signed in) use product analytics and limited session replay to operate and improve the service. I can update analytics preferences in my account privacy settings.
                </label>
              </div>
              <Button 
                className="w-full bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white h-12 text-base font-medium mb-4"
                onClick={handleEmailAuth}
                disabled={isLoading || !password || !agreeTerms}
              >
                {isLoading ? "Creating account..." : "Sign up"}
              </Button>
              <div className="text-center space-y-2">
                <button
                  onClick={() => {
                    setShowPasswordField(false);
                    setError(null);
                  }}
                  className="block w-full text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  Back
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Separator for phone form */}
      {!showEmailForm && (
        <div className="flex items-center my-6">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="flex-shrink mx-4 text-sm text-gray-600">or</span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div>
      )}

      {/* Social Login Options for phone form */}
      {!showEmailForm && (
        <>
          {socialAuth.google && (
            <Button
              variant="outline"
              className="w-full mb-3 flex items-center justify-start gap-3 px-4 h-12 hover:bg-gray-50 border-gray-300 text-base"
              onClick={() => void handleSocialOAuth("google")}
              disabled={isLoading}
            >
              <FaGoogle className="text-lg" />
              <span>Continue with Google</span>
            </Button>
          )}

          {socialAuth.apple && (
            <Button
              variant="outline"
              className="w-full mb-3 flex items-center justify-start gap-3 px-4 h-12 hover:bg-gray-50 border-gray-300 text-base"
              onClick={() => void handleSocialOAuth("apple")}
              disabled={isLoading}
            >
              <FaApple className="text-lg" />
              <span>Continue with Apple</span>
            </Button>
          )}
          
          <Button
            variant="outline"
            className="w-full mb-3 flex items-center justify-start gap-3 px-4 h-12 hover:bg-gray-50 border-gray-300 text-base"
            onClick={() => {
              setShowEmailForm(true);
              setAwaitingEmailVerification(false);
              setError(null);
            }}
            disabled={isLoading}
          >
            <CiMail className="text-lg" />
            <span>Continue with email</span>
          </Button>
        </>
      )}
    </div>
  );
}
