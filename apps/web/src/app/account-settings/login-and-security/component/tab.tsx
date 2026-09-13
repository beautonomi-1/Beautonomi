"use client";
import React, { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import { Shield, AlertTriangle, ExternalLink, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import Breadcrumb from "../../components/breadcrumb";
import BackButton from "../../components/back-button";
import { useAuth } from "@/providers/AuthProvider";
import { fetcher } from "@/lib/http/fetcher";
import { resetPassword } from "@/lib/supabase/auth";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PhoneInput } from "@/components/ui/phone-input";
import { getSupabaseClient } from "@/lib/supabase/client";
import { normalizeFullPhoneToE164 } from "@/lib/phone";
import {
  SUPABASE_AUTH_OTP_LENGTH,
  SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS,
  normalizeSupabaseAuthPhone,
  normalizeSupabaseSmsOtpToken,
  isCompleteSupabaseSmsOtp,
} from "@/lib/supabase/auth-sms-otp";
import { OtpDigitInput } from "@/components/ui/otp-digit-input";
import {
  describeReauthOtpDestination,
  isMailableEmail,
  maskEmailForDisplay,
  maskPhoneForDisplay,
} from "@beautonomi/utils";
import { useTranslation } from "@beautonomi/i18n";
import type { LoginAndSecurityInitial } from "../fetch-login-and-security-initial";

type AuthSecurityState = NonNullable<LoginAndSecurityInitial["profile"]["auth_security"]>;

function maskProfileEmail(email: string): string {
  return maskEmailForDisplay(email);
}

function displayProfileEmail(email: string | null | undefined): string {
  if (!email || !isMailableEmail(email)) return "";
  return maskProfileEmail(email);
}

function maskProfilePhone(phone: string): string {
  return maskPhoneForDisplay(phone);
}

// §Customer-launch (audit 2026-04): "LOGIN REQUESTS" and "SHARED ACCESS" tabs
// were placeholder-only ("This feature is coming soon.") and cluttered the
// security page for launch. Hide them until the underlying features ship;
// the TabsContent blocks are retained below so re-enabling is a one-line
// change.
const tabs = [
  { value: "step1" },
];

const LoginAccount = ({
  initial,
  accountHomeHref = "/account-settings",
  accountHomeLabel,
}: {
  initial: LoginAndSecurityInitial | null;
  accountHomeHref?: string;
  accountHomeLabel?: string;
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const homeLabel = accountHomeLabel ?? t("web.accountSettings.account");
  const [activeTab, setActiveTab] = useState("step1");
  const [showPasswordUpdate, setShowPasswordUpdate] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    nonce: "",
  });
  const [isRequestingPasswordNonce, setIsRequestingPasswordNonce] = useState(false);
  const [authSecurity, setAuthSecurity] = useState<AuthSecurityState | null>(
    () => initial?.profile?.auth_security ?? null,
  );
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordLastUpdated, setPasswordLastUpdated] = useState<string | null>(
    () => initial?.profile?.password_changed_at ?? null,
  );
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [deactivateData, setDeactivateData] = useState({
    password: "",
    verificationNonce: "",
    reason: "",
  });
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isRequestingDeactivateNonce, setIsRequestingDeactivateNonce] = useState(false);
  const [securityCopy, setSecurityCopy] = useState<{
    title: string;
    body: string;
    safety_tips_customer: { label: string; url: string };
    safety_tips_provider: { label: string; url: string };
  } | null>(() => initial?.securityCopy ?? null);
  // Email & phone (Login tab)
  const [profileEmail, setProfileEmail] = useState<string>(() => {
    const e = initial?.profile?.email;
    if (!e || typeof e !== "string") return "";
    return displayProfileEmail(e);
  });
  const [profilePhone, setProfilePhone] = useState<string>(() => {
    const p = initial?.profile?.phone;
    if (!p || typeof p !== "string") return "";
    return maskProfilePhone(p);
  });
  const skipPasswordHydrate = useRef(Boolean(initial?.profile));
  const skipProfileHydrate = useRef(Boolean(initial?.profile));
  const skipSecurityCopyHydrate = useRef(Boolean(initial?.securityCopy));
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showPhoneDialog, setShowPhoneDialog] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailStep, setEmailStep] = useState<"enter_email" | "enter_otp">("enter_email");
  const [pendingEmailForOtp, setPendingEmailForOtp] = useState("");
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isVerifyingEmailOtp, setIsVerifyingEmailOtp] = useState(false);
  const [phoneStep, setPhoneStep] = useState<"enter_phone" | "enter_otp">("enter_phone");
  const [pendingPhoneE164, setPendingPhoneE164] = useState("");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");
  const [dialogPhoneValue, setDialogPhoneValue] = useState("");
  const [isSendingPhoneOtp, setIsSendingPhoneOtp] = useState(false);
  const [isVerifyingPhoneOtp, setIsVerifyingPhoneOtp] = useState(false);
  const [isSigningOutGlobal, setIsSigningOutGlobal] = useState(false);
  const { signOut } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (skipPasswordHydrate.current) {
      skipPasswordHydrate.current = false;
      return;
    }
    void loadPasswordInfo();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps -- load when user changes

  useEffect(() => {
    if (!user) return;
    if (skipProfileHydrate.current) {
      skipProfileHydrate.current = false;
      return;
    }
    const loadProfile = async () => {
      try {
        const res = await fetcher.get<{ data?: { email?: string; phone?: string; auth_security?: AuthSecurityState | null } }>("/api/me/profile", { staleTimeMs: 30_000 });
        const data = res?.data ?? (res as { email?: string; phone?: string; auth_security?: AuthSecurityState | null });
        const email = data?.email;
        const phone = data?.phone;
        if (email) {
          setProfileEmail(displayProfileEmail(email));
        }
        if (phone) {
          setProfilePhone(maskProfilePhone(phone));
        }
        if (data?.auth_security) {
          setAuthSecurity(data.auth_security);
        }
      } catch {
        // ignore
      }
    };
    void loadProfile();
  }, [user]);

  useEffect(() => {
    if (skipSecurityCopyHydrate.current) {
      skipSecurityCopyHydrate.current = false;
      return;
    }
    fetcher.get<{ data: typeof securityCopy }>("/api/public/account-security-copy", { staleTimeMs: 30_000 })
      .then((res: { data?: typeof securityCopy }) => {
        const data = res?.data ?? res;
        if (data && typeof data === "object" && "title" in data && data.title) setSecurityCopy(data as typeof securityCopy);
      })
      .catch(() => {});
  }, []);

  const loadPasswordInfo = async () => {
    if (!user) return;
    try {
      const response = await fetcher.get<{ data: { password_changed_at?: string | null; auth_security?: AuthSecurityState | null } }>("/api/me/profile", { staleTimeMs: 0 });
      // Handle both response.data and direct response structure
      const profileData = response.data ?? (response as { password_changed_at?: string | null; auth_security?: AuthSecurityState | null });
      const passwordChangedAt = profileData?.password_changed_at;
      if (passwordChangedAt) {
        setPasswordLastUpdated(passwordChangedAt);
      }
      if (profileData?.auth_security) {
        setAuthSecurity(profileData.auth_security);
      }
    } catch (error) {
      console.error("Failed to load password info:", error);
      // Don't show error to user, just default to "Never"
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t("web.accountSettings.loginAndSecurity.never");
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return t("web.accountSettings.loginAndSecurity.today");
    if (diffDays === 1) return t("web.accountSettings.loginAndSecurity.yesterday");
    if (diffDays < 7) return t("web.accountSettings.loginAndSecurity.daysAgo", { count: diffDays });
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return weeks > 1
        ? t("web.accountSettings.loginAndSecurity.weeksAgo", { count: weeks })
        : t("web.accountSettings.loginAndSecurity.weekAgo", { count: weeks });
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return months > 1
        ? t("web.accountSettings.loginAndSecurity.monthsAgo", { count: months })
        : t("web.accountSettings.loginAndSecurity.monthAgo", { count: months });
    }
    return date.toLocaleDateString();
  };

  const handleUpdateClick = () => {
    setShowPasswordUpdate((prev) => !prev);
    if (!showPasswordUpdate) {
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        nonce: "",
      });
    }
  };

  const authSecurityLoaded = authSecurity != null;
  const hasPassword = authSecurity?.has_password === true;
  const isSettingFirstPassword = authSecurity?.has_password === false;
  const minimumPasswordLength = authSecurity?.policy.minimum_password_length ?? 8;
  const canVerifyWithCode = Boolean(
    authSecurity?.has_mailable_email || authSecurity?.has_phone,
  );
  const deactivateOtpDestination = describeReauthOtpDestination(authSecurity, {
    email: initial?.profile?.email ?? user?.email ?? null,
    phone: initial?.profile?.phone ?? null,
  });

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!isSettingFirstPassword && !passwordData.currentPassword) || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast.error(t("web.accountSettings.loginAndSecurity.allFieldsRequired"));
      return;
    }

    if (isSettingFirstPassword && !passwordData.nonce.trim()) {
      toast.error(t("web.accountSettings.loginAndSecurity.enterCodeBeforePassword"));
      return;
    }

    if (passwordData.newPassword.length < minimumPasswordLength) {
      toast.error(t("web.accountSettings.loginAndSecurity.passwordMinLength", { min: minimumPasswordLength }));
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error(t("web.accountSettings.loginAndSecurity.passwordsMismatch"));
      return;
    }

    try {
      setIsUpdatingPassword(true);
      await fetcher.put("/api/me/password", {
        mode: isSettingFirstPassword ? "set" : "change",
        currentPassword: isSettingFirstPassword ? undefined : passwordData.currentPassword,
        nonce: isSettingFirstPassword ? passwordData.nonce.trim() : undefined,
        newPassword: passwordData.newPassword,
      });
      toast.success(isSettingFirstPassword ? t("web.accountSettings.loginAndSecurity.passwordSet") : t("web.accountSettings.loginAndSecurity.passwordUpdated"));
      setShowPasswordUpdate(false);
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        nonce: "",
      });
      void loadPasswordInfo();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("web.accountSettings.loginAndSecurity.updatePasswordFailed"));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!user?.email || authSecurity?.email_is_placeholder) {
      toast.error(t("web.accountSettings.loginAndSecurity.emailNotFound"));
      return;
    }
    try {
      await resetPassword(user.email);
      toast.success(t("web.accountSettings.loginAndSecurity.resetEmailSent"));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("web.accountSettings.loginAndSecurity.resetEmailFailed"));
    }
  };

  const handleRequestPasswordNonce = async () => {
    if (!canVerifyWithCode) {
      toast.error(t("web.accountSettings.loginAndSecurity.addContactBeforePassword"));
      return;
    }
    setIsRequestingPasswordNonce(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      toast.success(t("web.accountSettings.loginAndSecurity.passwordNonceSent"));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("web.accountSettings.loginAndSecurity.sendCodeFailed"));
    } finally {
      setIsRequestingPasswordNonce(false);
    }
  };

  const handleSendEmailVerification = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !isMailableEmail(email)) {
      toast.error(t("web.accountSettings.loginAndSecurity.enterValidEmail"));
      return;
    }
    setIsSendingEmail(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      setPendingEmailForOtp(email);
      setEmailOtpCode("");
      setEmailStep("enter_otp");
      toast.success(t("web.accountSettings.loginAndSecurity.emailCodeSent"));
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("web.accountSettings.loginAndSecurity.sendCodeFailed"));
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleVerifyEmailOtp = async (otpOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(otpOverride ?? emailOtpCode);
    if (!pendingEmailForOtp || !isCompleteSupabaseSmsOtp(token)) return;
    setIsVerifyingEmailOtp(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({
        email: pendingEmailForOtp,
        token,
        type: "email_change",
      });
      if (error) throw error;
      await fetcher.post("/api/me/email/verify", { email: pendingEmailForOtp });
      setProfileEmail(displayProfileEmail(pendingEmailForOtp));
      setShowEmailDialog(false);
      setEmailStep("enter_email");
      setPendingEmailForOtp("");
      setEmailOtpCode("");
      setNewEmail("");
      toast.success(t("web.accountSettings.loginAndSecurity.emailUpdated"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("web.accountSettings.loginAndSecurity.verificationFailed"));
    } finally {
      setIsVerifyingEmailOtp(false);
    }
  };

  const handleSendPhoneOtp = async (e164: string) => {
    if (!e164 || !e164.startsWith("+")) return;
    const normalized = normalizeSupabaseAuthPhone(e164);
    setIsSendingPhoneOtp(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ phone: normalized });
      if (error) throw error;
      setPendingPhoneE164(normalized);
      setPhoneStep("enter_otp");
      setPhoneOtpCode("");
      toast.success(t("web.accountSettings.loginAndSecurity.phoneCodeSent"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("web.accountSettings.loginAndSecurity.sendPhoneCodeFailed"));
    } finally {
      setIsSendingPhoneOtp(false);
    }
  };

  const handleVerifyPhoneOtp = async (otpOverride?: string) => {
    const token = normalizeSupabaseSmsOtpToken(otpOverride ?? phoneOtpCode);
    if (!pendingPhoneE164 || !isCompleteSupabaseSmsOtp(token)) return;
    setIsVerifyingPhoneOtp(true);
    try {
      const supabase = getSupabaseClient();
      const phone = normalizeSupabaseAuthPhone(pendingPhoneE164);
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: "phone_change",
      });
      if (error) throw error;
      await fetcher.patch("/api/me/profile", { phone });
      const digits = phone.replace(/\D/g, "");
      setProfilePhone(digits.length >= 4 ? `${digits.substring(0, 3)} *** ***${digits.substring(digits.length - 4)}` : phone);
      setShowPhoneDialog(false);
      setPhoneStep("enter_phone");
      setPendingPhoneE164("");
      setPhoneOtpCode("");
      toast.success(t("web.accountSettings.loginAndSecurity.phoneUpdated"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("web.accountSettings.loginAndSecurity.verificationFailed"));
    } finally {
      setIsVerifyingPhoneOtp(false);
    }
  };

  const handleDeactivate = async () => {
    if (!authSecurityLoaded) {
      toast.error(t("web.accountSettings.loginAndSecurity.securityLoading"));
      return;
    }
    if (hasPassword && !deactivateData.password) {
      toast.error(t("web.accountSettings.loginAndSecurity.passwordRequiredDeactivate"));
      return;
    }
    if (!hasPassword && !deactivateData.verificationNonce.trim()) {
      toast.error(t("web.accountSettings.loginAndSecurity.codeRequiredDeactivate"));
      return;
    }

    try {
      setIsDeactivating(true);
      await fetcher.post("/api/me/deactivate", {
        password: hasPassword ? deactivateData.password : undefined,
        verificationNonce: hasPassword ? undefined : deactivateData.verificationNonce.trim(),
        reason: deactivateData.reason || null,
      });
      toast.success(t("web.accountSettings.loginAndSecurity.deactivated"));
      // Redirect to home with deactivated flag so user sees reactivate banner
      window.location.href = "/?deactivated=true";
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("web.accountSettings.loginAndSecurity.deactivateFailed"));
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleRequestDeactivateNonce = async () => {
    if (!canVerifyWithCode) {
      toast.error(t("web.accountSettings.loginAndSecurity.addContactBeforeDeactivate"));
      return;
    }
    setIsRequestingDeactivateNonce(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      toast.success(deactivateOtpDestination.codeSentMessage);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("web.accountSettings.loginAndSecurity.sendCodeFailed"));
    } finally {
      setIsRequestingDeactivateNonce(false);
    }
  };

  const handleGlobalSignOut = async () => {
    if (!window.confirm(t("web.accountSettings.loginAndSecurity.globalSignOutConfirm"))) {
      return;
    }
    setIsSigningOutGlobal(true);
    try {
      const res = await fetch("/api/auth/sign-out-global", {
        method: "POST",
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || t("web.accountSettings.loginAndSecurity.signOutEverywhereFailed"));
      }
      await signOut();
    } catch (error: any) {
      toast.error(error.message || t("web.accountSettings.loginAndSecurity.signOutEverywhereFailed"));
    } finally {
      setIsSigningOutGlobal(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50/50 py-6 md:py-8">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <BackButton href={accountHomeHref} />
        <Breadcrumb 
          items={[
            { label: homeLabel, href: accountHomeHref },
            { label: t("web.accountSettings.loginAndSecurity.title") }
          ]} 
        />
        
        {/* Page Header - Glass Card Style */}
        <div
          className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-6"
        >
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tighter mb-2 text-gray-900">{t("web.accountSettings.loginAndSecurity.title")}</h1>
          <p className="text-sm md:text-base text-gray-600 font-light">
            {t("web.accountSettings.loginAndSecurity.subtitle")}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto whitespace-nowrap mb-8" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            <TabsList className="flex gap-5 border-b bg-transparent">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={`py-2 font-light transition-colors ${
                    activeTab === tab.value
                      ? "border-b-2 border-primary text-primary text-sm font-semibold"
                      : "border-b-2 border-transparent text-sm text-gray-500 hover:text-primary"
                  }`}
                >
                  {t("web.accountSettings.loginAndSecurity.tabLogin")}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

        <TabsContent value="step1">
          <div className="flex flex-col md:flex-row justify-between gap-6">
            <div className="w-full md:w-2/3">
              {/* Password Section */}
              <div
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">{t("web.accountSettings.loginAndSecurity.password")}</h2>
                    <p className="text-sm text-gray-500 font-light">
                      {isSettingFirstPassword
                        ? t("web.accountSettings.loginAndSecurity.noPasswordSet")
                        : t("web.accountSettings.loginAndSecurity.lastUpdated", { date: formatDate(passwordLastUpdated) })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleUpdateClick}
                    className="text-primary border-primary hover:bg-primary hover:text-white"
                  >
                    {showPasswordUpdate
                      ? t("web.accountSettings.loginAndSecurity.cancel")
                      : hasPassword
                        ? t("web.accountSettings.loginAndSecurity.update")
                        : t("web.accountSettings.loginAndSecurity.setPassword")}
                  </Button>
                </div>

                {/* Password Update Section */}
                {showPasswordUpdate && (
                  <div
                    className="mt-6 pt-6 border-t border-white/40"
                  >
                    <form onSubmit={handlePasswordUpdate} className="flex flex-col space-y-4">
                      {isSettingFirstPassword ? (
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                          <p className="text-sm text-gray-700">
                            {t("web.accountSettings.loginAndSecurity.setPasswordIntro")}
                          </p>
                          {!canVerifyWithCode && (
                            <p className="mt-2 text-sm text-red-600">
                              {t("web.accountSettings.loginAndSecurity.addVerifyBeforePassword")}
                            </p>
                          )}
                          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                            <div className="flex-1">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                {t("web.accountSettings.loginAndSecurity.verificationCode")}
                              </label>
                              <Input
                                value={passwordData.nonce}
                                onChange={(e) =>
                                  setPasswordData({ ...passwordData, nonce: e.target.value.replace(/\D/g, "") })
                                }
                                className="w-full backdrop-blur-sm bg-white/60 border-white/40"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                required
                                placeholder={t("web.accountSettings.loginAndSecurity.enterCode")}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleRequestPasswordNonce}
                              disabled={isRequestingPasswordNonce || !canVerifyWithCode}
                            >
                              {isRequestingPasswordNonce
                                ? t("web.accountSettings.loginAndSecurity.sending")
                                : t("web.accountSettings.loginAndSecurity.sendCode")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t("web.accountSettings.loginAndSecurity.currentPassword")}
                          </label>
                          <Input
                            type="password"
                            value={passwordData.currentPassword}
                            onChange={(e) =>
                              setPasswordData({ ...passwordData, currentPassword: e.target.value })
                            }
                            className="w-full backdrop-blur-sm bg-white/60 border-white/40"
                            required
                            placeholder={t("web.accountSettings.loginAndSecurity.currentPasswordPlaceholder")}
                          />
                          <button
                            type="button"
                            onClick={handleForgotPassword}
                            className="text-primary hover:text-primary-hover underline text-sm font-medium mt-2 transition-colors"
                          >
                            {t("web.accountSettings.loginAndSecurity.forgotPassword")}
                          </button>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t("web.accountSettings.loginAndSecurity.newPassword")}
                        </label>
                        <Input
                          type="password"
                          value={passwordData.newPassword}
                          onChange={(e) =>
                            setPasswordData({ ...passwordData, newPassword: e.target.value })
                          }
                          className="w-full backdrop-blur-sm bg-white/60 border-white/40"
                          required
                          minLength={minimumPasswordLength}
                          placeholder={t("web.accountSettings.loginAndSecurity.newPasswordPlaceholder", { min: minimumPasswordLength })}
                        />
                        <p className="text-xs text-gray-500 mt-1">{t("web.accountSettings.loginAndSecurity.mustBeMinLength", { min: minimumPasswordLength })}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t("web.accountSettings.loginAndSecurity.confirmPassword")}
                        </label>
                        <Input
                          type="password"
                          value={passwordData.confirmPassword}
                          onChange={(e) =>
                            setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                          }
                          className="w-full backdrop-blur-sm bg-white/60 border-white/40"
                          required
                          placeholder={t("web.accountSettings.loginAndSecurity.confirmPasswordPlaceholder")}
                        />
                      </div>
                      <div className="flex justify-start">
                        <button
                          type="submit"
                          disabled={isUpdatingPassword}
                          className="bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isUpdatingPassword
                            ? isSettingFirstPassword ? t("web.accountSettings.loginAndSecurity.setting") : t("web.accountSettings.loginAndSecurity.updating")
                            : isSettingFirstPassword ? t("web.accountSettings.loginAndSecurity.setPasswordCta") : t("web.accountSettings.loginAndSecurity.updatePasswordCta")}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>

              {/* Email Section */}
              <div
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold tracking-tighter text-gray-900">{t("web.accountSettings.loginAndSecurity.email")}</h2>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNewEmail("");
                      setShowEmailDialog(true);
                    }}
                    className="text-primary border-primary hover:bg-primary hover:text-white"
                  >
                    {t("web.accountSettings.loginAndSecurity.changeEmail")}
                  </Button>
                </div>
                <p className="text-sm text-gray-600 font-light">
                  {profileEmail || t("web.accountSettings.loginAndSecurity.notSet")}
                </p>
              </div>

              {/* Phone Section */}
              <div
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <Phone className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold tracking-tighter text-gray-900">{t("web.accountSettings.loginAndSecurity.phone")}</h2>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPhoneStep("enter_phone");
                      setPendingPhoneE164("");
                      setPhoneOtpCode("");
                      setShowPhoneDialog(true);
                    }}
                    className="text-primary border-primary hover:bg-primary hover:text-white"
                  >
                    {t("web.accountSettings.loginAndSecurity.changePhone")}
                  </Button>
                </div>
                <p className="text-sm text-gray-600 font-light">
                  {profilePhone || t("web.accountSettings.loginAndSecurity.notSet")}
                </p>
              </div>

              {/*
                §Customer-launch (audit 2026-04): "Social accounts" block was
                a static "Coming soon" placeholder. Hidden until OAuth
                linking is wired to /api/auth/identities (or similar).
              */}

              {/* Active Sessions Section */}
              <div
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">{t("web.accountSettings.loginAndSecurity.activeSessions")}</h2>
                    <p className="text-sm text-gray-600 font-light">
                      {t("web.accountSettings.loginAndSecurity.activeSessionsBody")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleGlobalSignOut}
                    disabled={isSigningOutGlobal}
                    className="text-gray-900 border-gray-300 hover:bg-gray-50"
                  >
                    {isSigningOutGlobal
                      ? t("web.accountSettings.loginAndSecurity.signingOut")
                      : t("web.accountSettings.loginAndSecurity.signOutAllDevices")}
                  </Button>
                </div>
              </div>

              {/* Account Deactivation Section */}
              <div
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">{t("web.accountSettings.loginAndSecurity.account")}</h2>
                    <p className="text-sm text-gray-600 font-light">
                      {t("web.accountSettings.loginAndSecurity.deactivateBody")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeactivateDialog(true)}
                    className="text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
                  >
                    {t("web.accountSettings.loginAndSecurity.deactivate")}
                  </Button>
                </div>
              </div>
            </div>

            {/* Sidebar - Info Card */}
            <div className="w-full md:w-1/3">
              <div
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 sticky top-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Shield className="w-6 h-6 text-primary" />
                  <h2 className="text-lg font-semibold tracking-tighter text-gray-900">
                    {securityCopy?.title ?? t("web.accountSettings.loginAndSecurity.secureTitle")}
                  </h2>
                </div>
                <p className="mb-4 text-sm font-light text-gray-600 leading-relaxed">
                  {securityCopy?.body ?? t("web.accountSettings.loginAndSecurity.secureBody")}
                </p>
                <div className="space-y-3">
                  <Link 
                    href={securityCopy?.safety_tips_customer?.url ?? "/help#customer"}
                    className="text-primary hover:text-primary-hover text-sm font-medium underline transition-colors flex items-center gap-1.5 group"
                  >
                    <span>{securityCopy?.safety_tips_customer?.label ?? t("web.accountSettings.loginAndSecurity.safetyTipsCustomer")}</span>
                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <Link 
                    href={securityCopy?.safety_tips_provider?.url ?? "/help#provider"}
                    className="text-primary hover:text-primary-hover text-sm font-medium underline transition-colors flex items-center gap-1.5 group"
                  >
                    <span>{securityCopy?.safety_tips_provider?.label ?? t("web.accountSettings.loginAndSecurity.safetyTipsProvider")}</span>
                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/*
          Login Requests (step2) and Shared Access (step3) placeholders removed.
          No backing tables/APIs exist for these features. They will be implemented
          as proper features when the API layer is ready.
        */}
      </Tabs>

      {/* Change Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={(open) => { if (!open) { setEmailStep("enter_email"); setPendingEmailForOtp(""); setEmailOtpCode(""); setNewEmail(""); } setShowEmailDialog(open); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6 backdrop-blur-2xl bg-white/95 border border-white/40">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tighter text-gray-900">{t("web.accountSettings.loginAndSecurity.changeEmail")}</DialogTitle>
            <DialogDescription className="text-sm text-gray-600 font-light">
              {emailStep === "enter_email"
                ? t("web.accountSettings.loginAndSecurity.emailDialogDescEnter", { digits: SUPABASE_AUTH_OTP_LENGTH })
                : t("web.accountSettings.loginAndSecurity.emailDialogDescOtp", { digits: SUPABASE_AUTH_OTP_LENGTH })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {emailStep === "enter_email" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("web.accountSettings.loginAndSecurity.newEmailAddress")}</label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder={t("web.accountSettings.loginAndSecurity.emailPlaceholder")}
                  className="backdrop-blur-sm bg-white/60 border-white/40"
                />
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">{t("web.accountSettings.loginAndSecurity.enterVerificationCode")}</p>
                <p className="mb-3 text-sm text-gray-600">
                  {t("web.accountSettings.loginAndSecurity.emailCodeSentTo", { digits: SUPABASE_AUTH_OTP_LENGTH, email: pendingEmailForOtp })}
                </p>
                <OtpDigitInput
                  length={SUPABASE_AUTH_OTP_LENGTH}
                  value={emailOtpCode}
                  onChange={setEmailOtpCode}
                  onComplete={(code) => {
                    if (!isVerifyingEmailOtp && isCompleteSupabaseSmsOtp(code)) {
                      void handleVerifyEmailOtp(code);
                    }
                  }}
                  disabled={isVerifyingEmailOtp}
                  autoFocus
                  label={t("web.accountSettings.loginAndSecurity.emailOtpLabel")}
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-3">
            {emailStep === "enter_otp" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEmailStep("enter_email");
                    setPendingEmailForOtp("");
                    setEmailOtpCode("");
                  }}
                  className="border-gray-300 hover:bg-gray-50"
                >
                  {t("web.accountSettings.loginAndSecurity.back")}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleVerifyEmailOtp()}
                  disabled={isVerifyingEmailOtp || !isCompleteSupabaseSmsOtp(emailOtpCode)}
                  className="bg-primary hover:bg-primary-hover text-white"
                >
                  {isVerifyingEmailOtp ? t("web.accountSettings.loginAndSecurity.verifying") : t("web.accountSettings.loginAndSecurity.verifyAndSave")}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setShowEmailDialog(false)} className="border-gray-300 hover:bg-gray-50">{t("web.accountSettings.loginAndSecurity.cancel")}</Button>
                <Button
                  type="button"
                  onClick={() => void handleSendEmailVerification()}
                  disabled={isSendingEmail || !newEmail.trim()}
                  className="bg-primary hover:bg-primary-hover text-white"
                >
                  {isSendingEmail ? t("web.accountSettings.loginAndSecurity.sendingEllipsis") : t("web.accountSettings.loginAndSecurity.sendVerificationCode")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Phone Dialog */}
      <Dialog open={showPhoneDialog} onOpenChange={(open) => { if (!open) { setPhoneStep("enter_phone"); setPendingPhoneE164(""); setPhoneOtpCode(""); setDialogPhoneValue(""); } setShowPhoneDialog(open); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6 backdrop-blur-2xl bg-white/95 border border-white/40">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tighter text-gray-900">{t("web.accountSettings.loginAndSecurity.changePhoneNumber")}</DialogTitle>
            <DialogDescription className="text-sm text-gray-600 font-light">
              {phoneStep === "enter_phone"
                ? t("web.accountSettings.loginAndSecurity.phoneDialogDescEnter", {
                    digits: SUPABASE_AUTH_OTP_LENGTH,
                    minutes: Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60)),
                    minuteLabel: Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60) === 1
                      ? t("web.accountSettings.loginAndSecurity.minute")
                      : t("web.accountSettings.loginAndSecurity.minutes"),
                  })
                : t("web.accountSettings.loginAndSecurity.phoneDialogDescOtp", { digits: SUPABASE_AUTH_OTP_LENGTH })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {phoneStep === "enter_phone" ? (
              <PhoneInput
                inputId="account-settings-change-phone"
                label=""
                inputAriaLabel={t("web.accountSettings.loginAndSecurity.newPhoneNumber")}
                value={dialogPhoneValue}
                onChange={(v) => setDialogPhoneValue(v)}
                placeholder={t("web.accountSettings.loginAndSecurity.phonePlaceholder")}
                className="backdrop-blur-sm bg-white/60 border-white/40"
              />
            ) : (
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">{t("web.accountSettings.loginAndSecurity.enterVerificationCode")}</p>
                <p className="mb-3 text-sm text-gray-600">
                  {t("web.accountSettings.loginAndSecurity.smsCodeHint", { digits: SUPABASE_AUTH_OTP_LENGTH })}
                </p>
                <OtpDigitInput
                  length={SUPABASE_AUTH_OTP_LENGTH}
                  value={phoneOtpCode}
                  onChange={setPhoneOtpCode}
                  onComplete={(code) => {
                    if (!isVerifyingPhoneOtp && isCompleteSupabaseSmsOtp(code)) {
                      void handleVerifyPhoneOtp(code);
                    }
                  }}
                  disabled={isVerifyingPhoneOtp}
                  autoFocus
                  label={t("web.accountSettings.loginAndSecurity.phoneOtpLabel")}
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-3">
            {phoneStep === "enter_otp" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setPhoneStep("enter_phone"); setPhoneOtpCode(""); setPendingPhoneE164(""); }}
                  className="border-gray-300 hover:bg-gray-50"
                >
                  {t("web.accountSettings.loginAndSecurity.back")}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleVerifyPhoneOtp()}
                  disabled={isVerifyingPhoneOtp || !isCompleteSupabaseSmsOtp(phoneOtpCode)}
                  className="bg-primary hover:bg-primary-hover text-white"
                >
                  {isVerifyingPhoneOtp ? t("web.accountSettings.loginAndSecurity.verifying") : t("web.accountSettings.loginAndSecurity.verifyAndSave")}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setShowPhoneDialog(false)} className="border-gray-300 hover:bg-gray-50">{t("web.accountSettings.loginAndSecurity.cancel")}</Button>
                <Button
                  type="button"
                  onClick={() => {
                    const e164 = normalizeFullPhoneToE164(dialogPhoneValue) ?? dialogPhoneValue.replace(/\s/g, "").trim();
                    if (e164 && e164.startsWith("+")) handleSendPhoneOtp(e164);
                  }}
                  disabled={isSendingPhoneOtp || !dialogPhoneValue.trim() || !normalizeFullPhoneToE164(dialogPhoneValue)}
                  className="bg-primary hover:bg-primary-hover text-white"
                >
                  {isSendingPhoneOtp ? t("web.accountSettings.loginAndSecurity.sendingEllipsis") : t("web.accountSettings.loginAndSecurity.sendCode")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Account Dialog */}
      <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6 backdrop-blur-2xl bg-white/95 border border-white/40">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tighter text-gray-900">
              {t("web.accountSettings.loginAndSecurity.deactivateTitle")}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-gray-600 font-light">
                {t("web.accountSettings.loginAndSecurity.deactivateDialogBefore")}{" "}
                <a href="/reactivate" className="underline font-medium text-primary hover:no-underline">
                  {t("web.accountSettings.loginAndSecurity.visitingReactivatePage")}
                </a>{" "}
                {t("web.accountSettings.loginAndSecurity.deactivateDialogAfter")}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!authSecurityLoaded ? (
              <p className="text-sm text-gray-600">{t("web.accountSettings.loginAndSecurity.loadingVerification")}</p>
            ) : hasPassword ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("web.accountSettings.loginAndSecurity.enterPasswordToConfirm")}
                </label>
                <Input
                  type="password"
                  value={deactivateData.password}
                  onChange={(e) =>
                    setDeactivateData({ ...deactivateData, password: e.target.value })
                  }
                  placeholder={t("web.accountSettings.loginAndSecurity.yourPassword")}
                  required
                  className="backdrop-blur-sm bg-white/60 border-white/40"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm text-gray-700">
                  {t("web.accountSettings.loginAndSecurity.deactivateOtpHint", { hint: deactivateOtpDestination.sendButtonHint })}
                </p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t("web.accountSettings.loginAndSecurity.verificationCode")}
                    </label>
                    <Input
                      value={deactivateData.verificationNonce}
                      onChange={(e) =>
                        setDeactivateData({ ...deactivateData, verificationNonce: e.target.value.replace(/\D/g, "") })
                      }
                      placeholder={t("web.accountSettings.loginAndSecurity.enterCode")}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="backdrop-blur-sm bg-white/60 border-white/40"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRequestDeactivateNonce}
                    disabled={isRequestingDeactivateNonce || !canVerifyWithCode}
                  >
                    {isRequestingDeactivateNonce
                      ? t("web.accountSettings.loginAndSecurity.sending")
                      : t("web.accountSettings.loginAndSecurity.sendCode")}
                  </Button>
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("web.accountSettings.loginAndSecurity.reasonOptional")}
              </label>
              <textarea
                value={deactivateData.reason}
                onChange={(e) =>
                  setDeactivateData({ ...deactivateData, reason: e.target.value })
                }
                className="w-full px-3 py-2 border border-white/40 rounded-lg backdrop-blur-sm bg-white/60 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                rows={3}
                placeholder={t("web.accountSettings.loginAndSecurity.reasonPlaceholder")}
              />
            </div>
            <div className="bg-yellow-50/80 border border-yellow-200/60 rounded-lg p-3 backdrop-blur-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-yellow-800">
                  <strong>{t("web.accountSettings.loginAndSecurity.note")}</strong> {t("web.accountSettings.loginAndSecurity.deactivateNoteBefore")}{" "}
                  <a href="/reactivate" className="underline font-medium hover:no-underline">{t("web.accountSettings.loginAndSecurity.reactivatePage")}</a> {t("web.accountSettings.loginAndSecurity.deactivateNoteAfter")}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDeactivateDialog(false);
                setDeactivateData({ password: "", verificationNonce: "", reason: "" });
              }}
              className="border-gray-300 hover:bg-gray-50"
            >
              {t("web.accountSettings.loginAndSecurity.cancel")}
            </Button>
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={
                isDeactivating ||
                !authSecurityLoaded ||
                (hasPassword ? !deactivateData.password : !deactivateData.verificationNonce.trim())
              }
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeactivating
                ? t("web.accountSettings.loginAndSecurity.deactivating")
                : t("web.accountSettings.loginAndSecurity.deactivateAccountCta")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default LoginAccount;
