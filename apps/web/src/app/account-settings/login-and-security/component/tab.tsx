"use client";
import React, { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import { Shield, Lock, AlertTriangle, ExternalLink, Mail, Phone } from "lucide-react";
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
import type { LoginAndSecurityInitial } from "../fetch-login-and-security-initial";

type AuthSecurityState = NonNullable<LoginAndSecurityInitial["profile"]["auth_security"]>;

function maskProfileEmail(email: string): string {
  const parts = email.split("@");
  return parts[0]?.length > 0 ? `${parts[0].substring(0, 1)}****@${parts[1] || ""}` : email;
}

function maskProfilePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `${digits.substring(0, 3)} *** ***${digits.substring(digits.length - 4)}` : phone;
}

// §Customer-launch (audit 2026-04): "LOGIN REQUESTS" and "SHARED ACCESS" tabs
// were placeholder-only ("This feature is coming soon.") and cluttered the
// security page for launch. Hide them until the underlying features ship;
// the TabsContent blocks are retained below so re-enabling is a one-line
// change.
const tabs = [
  { value: "step1", label: "LOGIN" },
];

const LoginAccount = ({
  initial,
  accountHomeHref = "/account-settings",
  accountHomeLabel = "Account",
}: {
  initial: LoginAndSecurityInitial | null;
  accountHomeHref?: string;
  accountHomeLabel?: string;
}) => {
  const { user } = useAuth();
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
    return maskProfileEmail(e);
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
  const [isSendingEmail, setIsSendingEmail] = useState(false);
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
          setProfileEmail(maskProfileEmail(email));
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
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months > 1 ? 's' : ''} ago`;
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

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!isSettingFirstPassword && !passwordData.currentPassword) || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast.error("All fields are required");
      return;
    }

    if (isSettingFirstPassword && !passwordData.nonce.trim()) {
      toast.error("Enter the verification code before setting a password");
      return;
    }

    if (passwordData.newPassword.length < minimumPasswordLength) {
      toast.error(`New password must be at least ${minimumPasswordLength} characters long`);
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("New password and confirm password do not match");
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
      toast.success(isSettingFirstPassword ? "Password set successfully" : "Password updated successfully");
      setShowPasswordUpdate(false);
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        nonce: "",
      });
      void loadPasswordInfo();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to update password");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!user?.email || authSecurity?.email_is_placeholder) {
      toast.error("Email address not found");
      return;
    }
    try {
      await resetPassword(user.email);
      toast.success("Password reset email sent. Please check your inbox.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to send password reset email");
    }
  };

  const handleRequestPasswordNonce = async () => {
    if (!canVerifyWithCode) {
      toast.error("Add a verified email or phone number before setting a password.");
      return;
    }
    setIsRequestingPasswordNonce(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      toast.success("Verification code sent. Enter it below to set your password.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to send verification code");
    } finally {
      setIsRequestingPasswordNonce(false);
    }
  };

  const handleSendEmailVerification = async () => {
    const email = newEmail.trim();
    if (!email) {
      toast.error("Enter a new email address");
      return;
    }
    setIsSendingEmail(true);
    try {
      const response = await fetcher.patch("/api/me/profile", { email });
      const profile = (response as { data?: { email_change_pending?: boolean } })?.data;
      if (profile?.email_change_pending) {
        setShowEmailDialog(false);
        setNewEmail("");
        toast.success(
          "We sent confirmation links to your current email and your new address. Open each link to finish the change (both may be required).",
        );
      } else {
        toast.success("Verification email sent.");
        setShowEmailDialog(false);
        setNewEmail("");
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to send verification email");
    } finally {
      setIsSendingEmail(false);
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
      toast.success("Verification code sent to your phone.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send code");
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
      toast.success("Phone number updated successfully.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setIsVerifyingPhoneOtp(false);
    }
  };

  const handleDeactivate = async () => {
    if (!authSecurityLoaded) {
      toast.error("Still loading account security settings. Please try again.");
      return;
    }
    if (hasPassword && !deactivateData.password) {
      toast.error("Password is required to deactivate your account");
      return;
    }
    if (!hasPassword && !deactivateData.verificationNonce.trim()) {
      toast.error("Enter the verification code to deactivate your account");
      return;
    }

    try {
      setIsDeactivating(true);
      await fetcher.post("/api/me/deactivate", {
        password: hasPassword ? deactivateData.password : undefined,
        verificationNonce: hasPassword ? undefined : deactivateData.verificationNonce.trim(),
        reason: deactivateData.reason || null,
      });
      toast.success("Account deactivated successfully");
      // Redirect to home with deactivated flag so user sees reactivate banner
      window.location.href = "/?deactivated=true";
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to deactivate account");
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleRequestDeactivateNonce = async () => {
    if (!canVerifyWithCode) {
      toast.error("Add a verified email or phone number before deactivating this account.");
      return;
    }
    setIsRequestingDeactivateNonce(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      toast.success("A verification code has been sent to the email address on your account. Enter it below to confirm deactivation.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to send verification code");
    } finally {
      setIsRequestingDeactivateNonce(false);
    }
  };

  const handleGlobalSignOut = async () => {
    if (!window.confirm("This will end every active session across all your phones, tablets and browsers. You'll need to log in again everywhere. Are you sure?")) {
      return;
    }
    setIsSigningOutGlobal(true);
    try {
      const res = await fetch("/api/auth/sign-out-global", {
        method: "POST",
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Could not sign out everywhere");
      }
      await signOut();
    } catch (error: any) {
      toast.error(error.message || "Could not sign out everywhere");
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
            { label: accountHomeLabel, href: accountHomeHref },
            { label: "Login & security" }
          ]} 
        />
        
        {/* Page Header - Glass Card Style */}
        <div
          className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-6"
        >
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tighter mb-2 text-gray-900">Login & security</h1>
          <p className="text-sm md:text-base text-gray-600 font-light">
            Manage your password, email, phone, and login preferences
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
                  {tab.label}
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
                    <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">Password</h2>
                    <p className="text-sm text-gray-500 font-light">
                      {isSettingFirstPassword
                        ? "No password set yet"
                        : `Last updated ${formatDate(passwordLastUpdated)}`}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleUpdateClick}
                    className="text-primary border-primary hover:bg-primary hover:text-white"
                  >
                    {showPasswordUpdate ? "Cancel" : hasPassword ? "Update" : "Set password"}
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
                            This account uses one-time codes or social login. Send a verification code to your verified email or phone, then choose a password.
                          </p>
                          {!canVerifyWithCode && (
                            <p className="mt-2 text-sm text-red-600">
                              Add and verify an email or phone number before setting a password.
                            </p>
                          )}
                          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                            <div className="flex-1">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Verification code
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
                                placeholder="Enter code"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleRequestPasswordNonce}
                              disabled={isRequestingPasswordNonce || !canVerifyWithCode}
                            >
                              {isRequestingPasswordNonce ? "Sending..." : "Send code"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Current Password
                          </label>
                          <Input
                            type="password"
                            value={passwordData.currentPassword}
                            onChange={(e) =>
                              setPasswordData({ ...passwordData, currentPassword: e.target.value })
                            }
                            className="w-full backdrop-blur-sm bg-white/60 border-white/40"
                            required
                            placeholder="Enter your current password"
                          />
                          <button
                            type="button"
                            onClick={handleForgotPassword}
                            className="text-primary hover:text-primary-hover underline text-sm font-medium mt-2 transition-colors"
                          >
                            Forgot password?
                          </button>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          New Password
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
                          placeholder={`Enter new password (min ${minimumPasswordLength} characters)`}
                        />
                        <p className="text-xs text-gray-500 mt-1">Must be at least {minimumPasswordLength} characters long</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Confirm Password
                        </label>
                        <Input
                          type="password"
                          value={passwordData.confirmPassword}
                          onChange={(e) =>
                            setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                          }
                          className="w-full backdrop-blur-sm bg-white/60 border-white/40"
                          required
                          placeholder="Confirm your new password"
                        />
                      </div>
                      <div className="flex justify-start">
                        <button
                          type="submit"
                          disabled={isUpdatingPassword}
                          className="bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isUpdatingPassword
                            ? isSettingFirstPassword ? "Setting..." : "Updating..."
                            : isSettingFirstPassword ? "Set Password" : "Update Password"}
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
                    <h2 className="text-xl font-semibold tracking-tighter text-gray-900">Email</h2>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNewEmail("");
                      setShowEmailDialog(true);
                    }}
                    className="text-primary border-primary hover:bg-primary hover:text-white"
                  >
                    Change email
                  </Button>
                </div>
                <p className="text-sm text-gray-600 font-light">
                  {profileEmail || "Not set"}
                </p>
              </div>

              {/* Phone Section */}
              <div
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <Phone className="w-5 h-5 text-primary" />
                    <h2 className="text-xl font-semibold tracking-tighter text-gray-900">Phone</h2>
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
                    Change phone
                  </Button>
                </div>
                <p className="text-sm text-gray-600 font-light">
                  {profilePhone || "Not set"}
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
                    <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">Active sessions</h2>
                    <p className="text-sm text-gray-600 font-light">
                      Sign out from this app and every other phone, tablet or browser where your Beautonomi account is signed in.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleGlobalSignOut}
                    disabled={isSigningOutGlobal}
                    className="text-gray-900 border-gray-300 hover:bg-gray-50"
                  >
                    {isSigningOutGlobal ? "Signing out..." : "Sign out from all devices"}
                  </Button>
                </div>
              </div>

              {/* Account Deactivation Section */}
              <div
                className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 mb-6"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tighter mb-2 text-gray-900">Account</h2>
                    <p className="text-sm text-gray-600 font-light">
                      Deactivate your account if you no longer want to use Beautonomi
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeactivateDialog(true)}
                    className="text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
                  >
                    Deactivate
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
                    {securityCopy?.title ?? "Keeping your account secure"}
                  </h2>
                </div>
                <p className="mb-4 text-sm font-light text-gray-600 leading-relaxed">
                  {securityCopy?.body ?? "We regularly review accounts to make sure they're as secure as possible. We'll also let you know if there's more we can do to increase the security of your account."}
                </p>
                <div className="space-y-3">
                  <Link 
                    href={securityCopy?.safety_tips_customer?.url ?? "/help#customer"}
                    className="text-primary hover:text-primary-hover text-sm font-medium underline transition-colors flex items-center gap-1.5 group"
                  >
                    <span>{securityCopy?.safety_tips_customer?.label ?? "Safety tips for customers"}</span>
                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                  <Link 
                    href={securityCopy?.safety_tips_provider?.url ?? "/help#provider"}
                    className="text-primary hover:text-primary-hover text-sm font-medium underline transition-colors flex items-center gap-1.5 group"
                  >
                    <span>{securityCopy?.safety_tips_provider?.label ?? "Safety tips for providers"}</span>
                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Login Requests Tab */}
        <TabsContent value="step2">
          <div
            className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 md:p-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold tracking-tighter text-gray-900">Login Requests</h2>
            </div>
            <div className="text-center py-12">
              <Lock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 font-light mb-2">This feature is coming soon.</p>
              <p className="text-sm text-gray-500">
                View and manage login requests from new devices and locations.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Shared Access Tab */}
        <TabsContent value="step3">
          <div
            className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 md:p-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-6 h-6 text-primary" />
              <h2 className="text-xl font-semibold tracking-tighter text-gray-900">Shared Access</h2>
            </div>
            <div className="text-center py-12">
              <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 font-light mb-2">This feature is coming soon.</p>
              <p className="text-sm text-gray-500">
                Manage shared access to your account with trusted family members or assistants.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Change Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={(open) => { setShowEmailDialog(open); if (!open) setNewEmail(""); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6 backdrop-blur-2xl bg-white/95 border border-white/40">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tighter text-gray-900">Change email</DialogTitle>
            <DialogDescription className="text-sm text-gray-600 font-light">
              Enter your new email. We&apos;ll email confirmation links—you may need to confirm from your current
              address and the new one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">New email address</label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="you@example.com"
                className="backdrop-blur-sm bg-white/60 border-white/40"
              />
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button type="button" variant="outline" onClick={() => setShowEmailDialog(false)} className="border-gray-300 hover:bg-gray-50">Cancel</Button>
            <Button
              type="button"
              onClick={handleSendEmailVerification}
              disabled={isSendingEmail || !newEmail.trim()}
              className="bg-primary hover:bg-primary-hover text-white"
            >
              {isSendingEmail ? "Sending…" : "Send verification email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Phone Dialog */}
      <Dialog open={showPhoneDialog} onOpenChange={(open) => { if (!open) { setPhoneStep("enter_phone"); setPendingPhoneE164(""); setPhoneOtpCode(""); setDialogPhoneValue(""); } setShowPhoneDialog(open); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6 backdrop-blur-2xl bg-white/95 border border-white/40">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-tighter text-gray-900">Change phone number</DialogTitle>
            <DialogDescription className="text-sm text-gray-600 font-light">
              {phoneStep === "enter_phone"
                ? `Enter your new phone number. We'll SMS a ${SUPABASE_AUTH_OTP_LENGTH}-digit code (valid about ${Math.max(1, Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60))} ${Math.round(SUPABASE_AUTH_SMS_OTP_EXPIRY_SECONDS / 60) === 1 ? "minute" : "minutes"}).`
                : `Enter the ${SUPABASE_AUTH_OTP_LENGTH}-digit code we sent to your phone.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {phoneStep === "enter_phone" ? (
              <PhoneInput
                inputId="account-settings-change-phone"
                label=""
                inputAriaLabel="New phone number"
                value={dialogPhoneValue}
                onChange={(v) => setDialogPhoneValue(v)}
                placeholder="Phone number"
                className="backdrop-blur-sm bg-white/60 border-white/40"
              />
            ) : (
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">Enter verification code</p>
                <p className="mb-3 text-sm text-gray-600">
                  {SUPABASE_AUTH_OTP_LENGTH}-digit code from your SMS
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
                  label="Phone verification code"
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
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleVerifyPhoneOtp()}
                  disabled={isVerifyingPhoneOtp || !isCompleteSupabaseSmsOtp(phoneOtpCode)}
                  className="bg-primary hover:bg-primary-hover text-white"
                >
                  {isVerifyingPhoneOtp ? "Verifying…" : "Verify & save"}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setShowPhoneDialog(false)} className="border-gray-300 hover:bg-gray-50">Cancel</Button>
                <Button
                  type="button"
                  onClick={() => {
                    const e164 = normalizeFullPhoneToE164(dialogPhoneValue) ?? dialogPhoneValue.replace(/\s/g, "").trim();
                    if (e164 && e164.startsWith("+")) handleSendPhoneOtp(e164);
                  }}
                  disabled={isSendingPhoneOtp || !dialogPhoneValue.trim() || !normalizeFullPhoneToE164(dialogPhoneValue)}
                  className="bg-primary hover:bg-primary-hover text-white"
                >
                  {isSendingPhoneOtp ? "Sending…" : "Send code"}
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
              Deactivate Your Account
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-gray-600 font-light">
                This will deactivate your account. You can reactivate later by{" "}
                <a href="/reactivate" className="underline font-medium text-primary hover:no-underline">
                  visiting the reactivate page
                </a>{" "}
                or logging in again.
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!authSecurityLoaded ? (
              <p className="text-sm text-gray-600">Loading verification options…</p>
            ) : hasPassword ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter your password to confirm
                </label>
                <Input
                  type="password"
                  value={deactivateData.password}
                  onChange={(e) =>
                    setDeactivateData({ ...deactivateData, password: e.target.value })
                  }
                  placeholder="Your password"
                  required
                  className="backdrop-blur-sm bg-white/60 border-white/40"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm text-gray-700">
                  Confirm this sensitive action with a one-time code.
                </p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Verification code
                    </label>
                    <Input
                      value={deactivateData.verificationNonce}
                      onChange={(e) =>
                        setDeactivateData({ ...deactivateData, verificationNonce: e.target.value.replace(/\D/g, "") })
                      }
                      placeholder="Enter code"
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
                    {isRequestingDeactivateNonce ? "Sending..." : "Send code"}
                  </Button>
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason (optional)
              </label>
              <textarea
                value={deactivateData.reason}
                onChange={(e) =>
                  setDeactivateData({ ...deactivateData, reason: e.target.value })
                }
                className="w-full px-3 py-2 border border-white/40 rounded-lg backdrop-blur-sm bg-white/60 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                rows={3}
                placeholder="Tell us why you're deactivating your account (optional)"
              />
            </div>
            <div className="bg-yellow-50/80 border border-yellow-200/60 rounded-lg p-3 backdrop-blur-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Your account will be deactivated immediately. To reactivate, go to the{" "}
                  <a href="/reactivate" className="underline font-medium hover:no-underline">reactivate page</a> or log in again.
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
              Cancel
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
              {isDeactivating ? "Deactivating..." : "Deactivate Account"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default LoginAccount;
