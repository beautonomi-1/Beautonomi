"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FaApple, FaFacebook, FaGoogle } from "react-icons/fa6";
import { CiMail } from "react-icons/ci";
import { X, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { signIn as signInAuth, signUp as signUpAuth, signInWithOAuth, resendVerificationEmail } from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { PhoneInput } from "@/components/ui/phone-input";
import { normalizeFullPhoneToE164 } from "@/lib/phone";


interface LoginModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  initialMode?: "login" | "signup";
  redirectContext?: "provider" | "customer"; // Context for where signup was initiated
  onAuthSuccess?: () => void; // Callback when authentication succeeds
  redirectUrl?: string; // URL to redirect to after auth (for OAuth callbacks)
}

export default function LoginModal({ open, setOpen, initialMode, redirectContext, onAuthSuccess, redirectUrl }: LoginModalProps) {
  const router = useRouter();
  const { refreshUser, role: contextRole, user } = useAuth();
  
  // Close modal and call onAuthSuccess when user becomes authenticated
  useEffect(() => {
    if (user && open && onAuthSuccess) {
      // User just logged in, close modal and call callback
      setOpen(false);
      // Small delay to ensure state is updated
      setTimeout(() => {
        onAuthSuccess();
      }, 300);
    }
  }, [user, open, onAuthSuccess, setOpen]);
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isSignup, setIsSignup] = useState(initialMode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneFull, setPhoneFull] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [sentPhoneE164, setSentPhoneE164] = useState("");

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      // If initialMode is provided (login or signup), show email form directly
      // Otherwise, show phone input first
      setShowEmailForm(initialMode === "login" || initialMode === "signup");
      setIsSignup(initialMode === "signup");
      // Don't show password field separately for login mode - we'll show it inline
      setShowPasswordField(false);
      setError(null);
      setEmail("");
      setPassword("");
      setFullName("");
      setPhoneFull("");
      setShowResendVerification(false);
      setShowPassword(false);
      setOtpSent(false);
      setOtpCode("");
      setSentPhoneE164("");
    }
  }, [open, initialMode]);

  const handleEmailContinue = () => {
    if (!email) {
      setError("Email is required");
      return;
    }
    setShowPasswordField(true);
    setError(null);
  };

  const handleEmailAuth = async () => {
    // Clear any previous errors immediately
    setError(null);
    setShowResendVerification(false);
    
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    // Trim email and password to avoid whitespace issues
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError("Email and password are required");
      return;
    }

    setIsLoading(true);
    // Ensure error is cleared before attempting login
    setError(null);
    setShowResendVerification(false);

    try {
      if (isSignup) {
        // Sign up new user
        if (!fullName) {
          setError("Full name is required");
          setIsLoading(false);
          return;
        }

        // Set role based on redirect context - if signing up from provider flow, set as provider_owner
        const userRole = redirectContext === "provider" ? "provider_owner" : "customer";

        const signupResult = await signUpAuth({
          email: trimmedEmail,
          password: trimmedPassword,
          fullName: fullName?.trim(),
          phone: phoneFull ? (normalizeFullPhoneToE164(phoneFull) ?? phoneFull.replace(/\s/g, "").trim()) : undefined,
          role: userRole,
        });

        // Check if we have a session (user is logged in)
        // If email verification is disabled, Supabase returns a session immediately
        // If email verification is enabled, session will be null until email is verified
        if (signupResult?.session) {
          // User is logged in (email verification disabled or already verified)
          toast.success("Account created successfully! Welcome to Beautonomi.");
          
          // Wait for auth state to update
          await refreshUser();
          
          // Small delay to ensure auth context is updated
          await new Promise(resolve => setTimeout(resolve, 300));
          
          setOpen(false);
          
          // Call onAuthSuccess callback if provided (e.g., continue booking)
          if (onAuthSuccess) {
            onAuthSuccess();
            return;
          }
          
          // Context-aware redirect: if signing up from provider flow, go to onboarding
          if (redirectContext === "provider") {
            router.push("/provider/onboarding");
          } else if (redirectUrl) {
            router.push(redirectUrl);
          } else {
            router.push("/account-settings");
          }
        } else if (signupResult?.user) {
          // User was created but no session - this means email verification is required
          // Try to sign in immediately as a fallback (in case verification is actually disabled)
          try {
            const loginResult = await signInAuth({ email: trimmedEmail, password: trimmedPassword });
            
            // Check if login actually created a session
            if (loginResult?.session) {
              toast.success("Account created successfully! Welcome to Beautonomi.");
              
              // Wait for auth state to update
              await refreshUser();
              
              // Small delay to ensure auth context is updated
              await new Promise(resolve => setTimeout(resolve, 300));
              
              setOpen(false);
              
              // Call onAuthSuccess callback if provided
              if (onAuthSuccess) {
                onAuthSuccess();
                return;
              }
              
              if (redirectContext === "provider") {
                router.push("/provider/onboarding");
              } else if (redirectUrl) {
                router.push(redirectUrl);
              } else {
                router.push("/account-settings");
              }
            } else {
              // Login didn't create a session - email verification is required
              throw new Error("Email verification required");
            }
          } catch (loginError: unknown) {
            // If login fails, email verification is required
            console.log("Auto-login after signup failed, email verification is required:", loginError);
            
            // Don't close modal or redirect - user needs to verify email first
            toast.success(
              "Account created! Please check your email to verify your account. You'll be able to log in after verification.",
              { duration: 6000 }
            );
            
            // Switch to login mode and show resend verification option
            setIsSignup(false);
            setShowResendVerification(true);
            setShowPasswordField(true);
            
            // Don't redirect - let user verify email first
            // The modal will stay open so they can resend verification if needed
          }
        } else {
          // Unexpected case - user wasn't created
          throw new Error("Failed to create account. Please try again.");
        }
      } else {
        // Sign in existing user
        await signInAuth({ email: trimmedEmail, password: trimmedPassword });
        
        // Clear any errors on successful sign in
        setError(null);
        setShowResendVerification(false);
        
        // Refresh user data to get updated role (this already includes role in the returned user)
        // Add timeout handling - if refreshUser times out, try to get role from session
        let updatedUser = await refreshUser();
        
        // If refreshUser timed out or returned null, wait a bit and try once more (max 2 retries)
        let retries = 0;
        while (!updatedUser && retries < 2) {
          // Wait a moment for auth state to settle
          await new Promise(resolve => setTimeout(resolve, 500));
          updatedUser = await refreshUser();
          retries++;
        }
        
        // Get role directly from updated user
        let userRole = updatedUser?.role;
        
        // If we still don't have a role after retries, wait a bit more for auth context to update
        if (!userRole) {
          // Wait for auth state change listener to update the context
          await new Promise(resolve => setTimeout(resolve, 500));
          // Try one more time
          updatedUser = await refreshUser();
          userRole = updatedUser?.role;
        }
        
        // Final role check
        const finalRole = userRole || contextRole;
        
        // Only close modal and redirect if we have a role
        if (finalRole) {
          // Clear any errors before closing
          setError(null);
          setShowResendVerification(false);
          toast.success("Logged in successfully!");
          setOpen(false);
          
          // Role-based redirect after login - immediate redirect
          // Use replace instead of push to avoid back button issues
          if (finalRole === "superadmin") {
            router.replace("/admin/dashboard");
          } else if (finalRole === "provider_owner" || finalRole === "provider_staff") {
            router.replace("/provider/dashboard");
          } else if (redirectUrl) {
            router.replace(redirectUrl);
          } else {
            // If redirectContext is provider, send customers to onboarding to become a provider
            if (redirectContext === "provider") {
              router.replace("/provider/onboarding");
            } else {
              router.replace("/");
            }
          }
        } else {
          // Role not loaded yet: redirect to /portal so server can route by role (provider → dashboard, etc.)
          setError(null);
          setOpen(false);
          toast.success("Logged in successfully!");
          router.replace("/portal");
          setIsLoading(false);
        }
      }
    } catch (error: unknown) {
      console.error("Auth error:", error);
      const errorMessage = error instanceof Error ? error.message : "Authentication failed. Please try again.";
      
      // Check for specific error types
      const lowerErrorMessage = errorMessage.toLowerCase();
      
      // Check if this is specifically an email verification issue
      if (lowerErrorMessage.includes("email not confirmed") || 
          lowerErrorMessage.includes("email_not_confirmed") ||
          lowerErrorMessage.includes("verify your email")) {
        setError("Please verify your email address before logging in. Check your inbox for the verification email.");
        setShowResendVerification(true);
      } 
      // Check if this is invalid credentials (could be wrong password OR unverified email)
      else if (lowerErrorMessage.includes("invalid login credentials") || 
               lowerErrorMessage.includes("invalid credentials")) {
        // Show clear error message
        setError("Invalid login credentials. Please check your email and password.");
        // Show resend verification as a secondary option (less prominent)
        // This helps users who might have unverified emails, but doesn't assume that's the issue
        setShowResendVerification(true);
      } 
      // Other errors
      else {
        setError(errorMessage);
        // Only show resend verification for email-related errors
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
      await resendVerificationEmail(email.trim());
      toast.success("Verification email sent! Please check your inbox and spam folder.");
      setShowResendVerification(false);
    } catch (error: unknown) {
      console.error("Error resending verification email:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to send verification email.";
      
      // Check if the error indicates the email doesn't need verification or doesn't exist
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

  const handleEmailButtonClick = () => {
    setShowEmailForm(true);
    // Default to login unless initialMode is explicitly signup
    setIsSignup(initialMode === "signup");
    setError(null);
  };

  const fullPhoneE164 = normalizeFullPhoneToE164(phoneFull) ?? (phoneFull || "").replace(/\s/g, "").trim();
  const isValidE164 = fullPhoneE164.startsWith("+") && fullPhoneE164.length >= 11;

  const handlePhoneSendOtp = async () => {
    if (!isValidE164) {
      setError("Please enter a valid phone number with country code (e.g. +27 82 345 6789)");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: fullPhoneE164,
        options: { channel: "sms" },
      });
      if (otpError) throw otpError;
      setSentPhoneE164(fullPhoneE164);
      setOtpSent(true);
      setOtpCode("");
      toast.success("Check your phone for the verification code");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send code";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim() || !sentPhoneE164) return;
    setIsLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: sentPhoneE164,
        token: otpCode.trim(),
        type: "sms",
      });
      if (verifyError) throw verifyError;
      await refreshUser();
      setOpen(false);
      onAuthSuccess?.();
      if (redirectContext === "provider") {
        router.replace("/provider/dashboard");
      }
      toast.success("You're signed in");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid code";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: "google" | "facebook" | "apple") => {
    setIsLoading(true);
    setError(null);

    try {
      // Callback must be /auth/callback so the code can be exchanged. Add next= for post-login redirect.
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const callbackUrl =
        redirectContext === "provider"
          ? `${origin}/auth/callback?next=/provider/dashboard`
          : `${origin}/auth/callback`;
      await signInWithOAuth(provider, callbackUrl);
      // OAuth will redirect, so we don't need to do anything else here
      toast.info(`Redirecting to ${provider}...`);
    } catch (error: unknown) {
      console.error("OAuth error:", error);
      const msg = error instanceof Error ? error.message : `Failed to sign in with ${provider}`;
      setError(msg);
      toast.error(msg);
      setIsLoading(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-[440px] m-0 sm:m-4 p-0 z-[9999] overflow-auto max-h-[90vh] sm:max-h-[85vh] rounded-[28px] sm:rounded-[32px] bg-white shadow-2xl border-0">
        <DialogHeader className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2 relative">
          <button
            onClick={() => setOpen(false)}
            className="absolute left-4 top-4 sm:left-5 sm:top-5 text-gray-500 hover:text-gray-700 p-2 -m-2 rounded-full hover:bg-gray-100 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <DialogTitle className="text-center text-base sm:text-lg font-semibold sr-only">
            Log in or sign up
          </DialogTitle>
          <DialogDescription className="sr-only">
            Log in or create a new Beautonomi account to access all features
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 sm:px-6 pb-6 sm:pb-8 pt-0">
          <h2 className="text-2xl sm:text-[28px] font-bold text-gray-900 tracking-tight mb-1">Welcome to Beautonomi</h2>
          <p className="text-[15px] text-gray-500 mb-7 sm:mb-8">Log in or sign up to continue</p>
          
          {/* Error Message */}
          {error && (
            <div className="mb-5 p-4 bg-red-50/90 border border-red-100 rounded-2xl">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-600">{error}</p>
                  {showResendVerification && (
                    <div className="mt-3">
                      <p className="text-[13px] text-gray-600 mb-2">
                        If you haven&apos;t verified your email yet:
                      </p>
                      <button
                        onClick={handleResendVerification}
                        disabled={isResendingVerification}
                        className="text-sm font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed py-1 rounded-lg touch-manipulation"
                      >
                        {isResendingVerification ? "Sending…" : "Resend verification email"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Phone Input or OTP step (Default) */}
          {!showEmailForm && !otpSent && (
            <>
              <div className="mb-5">
                <PhoneInput
                  label="Phone number"
                  value={phoneFull}
                  onChange={setPhoneFull}
                  placeholder="e.g. 82 123 4567"
                  defaultCountryCode="+27"
                />
              </div>
              
              <p className="text-[13px] text-gray-500 mb-6 leading-relaxed">
                We&apos;ll send you a verification code. Standard rates apply.{" "}
                <Link href="/privacy-policy" className="font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900" onClick={() => setOpen(false)}>
                  Privacy Policy
                </Link>
              </p>
              
              <Button 
                className="w-full rounded-2xl bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary-hover text-white min-h-[52px] h-12 text-base font-semibold mb-6 touch-manipulation shadow-lg shadow-pink-200/40"
                onClick={handlePhoneSendOtp}
                disabled={isLoading || !isValidE164}
              >
                {isLoading ? "Sending code…" : "Continue"}
              </Button>
            </>
          )}

          {/* OTP verification step (after phone OTP sent) */}
          {!showEmailForm && otpSent && (
            <>
              <p className="text-base font-semibold text-gray-900 mb-1">Enter code</p>
              <p className="text-[13px] text-gray-500 mb-5">
                We sent a 6-digit code to <span className="font-medium text-gray-700">{sentPhoneE164}</span>
              </p>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setOtpCode(v);
                  if (error) setError(null);
                }}
                className="text-center text-xl sm:text-2xl tracking-[0.4em] font-mono rounded-2xl min-h-[56px] mb-5 border-gray-200 focus-visible:ring-2 focus-visible:ring-primary/30"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && otpCode.trim().length >= 4) handleVerifyOtp();
                }}
              />
              <Button
                className="w-full rounded-2xl bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary-hover text-white min-h-[52px] h-12 text-base font-semibold mb-4 touch-manipulation shadow-lg shadow-pink-200/40"
                onClick={handleVerifyOtp}
                disabled={isLoading || otpCode.trim().length < 4}
              >
                {isLoading ? "Verifying…" : "Verify"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtpCode("");
                  setSentPhoneE164("");
                  setError(null);
                }}
                className="w-full py-3 text-[15px] text-gray-500 hover:text-gray-900 font-medium touch-manipulation rounded-xl active:bg-gray-100"
              >
                Use different number
              </button>
            </>
          )}

          {/* Email Form (shown when "Continue with email" is clicked) */}
          {showEmailForm && (
            <>
              {/* Back to phone/social - clear escape hatch */}
              <button
                type="button"
                onClick={() => {
                  setShowEmailForm(false);
                  setShowPasswordField(false);
                  setError(null);
                }}
                className="flex items-center gap-2 text-[15px] text-gray-500 hover:text-gray-900 font-medium mb-5 -mx-1 px-1 py-2 rounded-xl active:bg-gray-100 touch-manipulation"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                Back to phone or social
              </button>
              {/* Step 1: Email Input (or both email and password for login mode) */}
              {!showPasswordField && (
                <>
                  {isSignup && (
                    <div className="mb-4">
                      <Label className="text-sm font-medium text-gray-700 mb-2 block">Full name</Label>
                      <Input
                        type="text"
                        className="text-base min-h-[48px] h-12 rounded-2xl border-gray-200 focus-visible:ring-2 focus-visible:ring-primary/20"
                        placeholder="Full name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && fullName && email && !isLoading) {
                            handleEmailContinue();
                          }
                        }}
                        autoComplete="name"
                        autoFocus
                      />
                    </div>
                  )}
                  <div className="mb-4">
                    <Label className="text-sm font-medium text-gray-700 mb-2 block">Email</Label>
                    <Input
                      type="email"
                      className="text-base min-h-[48px] h-12 rounded-2xl border-gray-200 focus-visible:ring-2 focus-visible:ring-primary/20"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && email && !isLoading) {
                          if (initialMode === "login") {
                            const passwordInput = document.querySelector('input[type="password"], input[type="text"][placeholder="Password"]') as HTMLInputElement;
                            if (passwordInput) {
                              passwordInput.focus();
                            } else {
                              handleEmailContinue();
                            }
                          } else {
                            handleEmailContinue();
                          }
                        }
                      }}
                      autoComplete={isSignup ? "email" : "username"}
                      inputMode="email"
                      autoFocus={!isSignup}
                    />
                  </div>
                  {/* Show password field immediately in login mode (when not signup) */}
                  {!isSignup && (
                    <div className="mb-5">
                      <Label className="text-sm font-medium text-gray-700 mb-2 block">Password</Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          className="text-base min-h-[48px] h-12 rounded-2xl border-gray-200 pr-12 focus-visible:ring-2 focus-visible:ring-primary/20"
                          placeholder="Password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (error) {
                              setError(null);
                              setShowResendVerification(false);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && email && password && !isLoading) {
                              handleEmailAuth();
                            }
                          }}
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          tabIndex={0}
                        >
                          {showPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                  {!isSignup && (
                    <div className="mb-5 text-center">
                      <Link
                        href="/forgot-password"
                        onClick={() => setOpen(false)}
                        className="text-[15px] text-gray-500 hover:text-primary font-medium py-2 inline-block touch-manipulation"
                      >
                        Forgot your password? <span className="text-primary font-semibold">Reset it</span>
                      </Link>
                    </div>
                  )}
                  <Button 
                    className="w-full rounded-2xl bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary-hover text-white min-h-[52px] h-12 text-base font-semibold mb-6 touch-manipulation shadow-lg shadow-pink-200/40"
                    onClick={!isSignup ? handleEmailAuth : handleEmailContinue}
                    disabled={isLoading || !email || (!isSignup && !password)}
                  >
                    {!isSignup ? (isLoading ? "Logging in…" : "Log in") : "Continue"}
                  </Button>
                  
                  {/* Separator */}
                  <div className="flex items-center my-6">
                    <div className="flex-grow border-t border-gray-200 rounded-full"></div>
                    <span className="flex-shrink mx-4 text-[13px] text-gray-400 font-medium">or</span>
                    <div className="flex-grow border-t border-gray-200 rounded-full"></div>
                  </div>

                  {/* Social Login Options */}
                  <Button
                    variant="outline"
                    className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                    onClick={() => handleSocialLogin("google")}
                    disabled={isLoading}
                  >
                    <FaGoogle className="text-lg shrink-0" />
                    <span>Continue with Google</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                    onClick={() => handleSocialLogin("apple")}
                    disabled={isLoading}
                  >
                    <FaApple className="text-lg shrink-0" />
                    <span>Continue with Apple</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                    onClick={() => {
                      setShowEmailForm(false);
                      setError(null);
                    }}
                    disabled={isLoading}
                  >
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>Continue with Phone</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                    onClick={() => handleSocialLogin("facebook")}
                    disabled={isLoading}
                  >
                    <FaFacebook className="text-lg text-blue-600 shrink-0" />
                    <span>Continue with Facebook</span>
                  </Button>

                  {/* Need help link */}
                  <div className="text-center mt-6">
                    <button
                      onClick={() => {
                        window.open("/help", "_blank");
                      }}
                      className="text-[15px] text-gray-500 hover:text-gray-900 font-medium py-2 touch-manipulation"
                    >
                      Need help?
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Password Input (after email is entered) */}
              {showPasswordField && (
                <>
                  <div className="mb-5">
                    <Label className="text-sm font-medium text-gray-700 mb-2 block">Password</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        className="text-base min-h-[48px] h-12 rounded-2xl border-gray-200 pr-12 focus-visible:ring-2 focus-visible:ring-primary/20"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) {
                            setError(null);
                            setShowResendVerification(false);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && email && password && !isLoading) {
                            handleEmailAuth();
                          }
                        }}
                        autoComplete={isSignup ? "new-password" : "current-password"}
                        autoFocus={showPasswordField}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 p-2 rounded-xl hover:bg-gray-100 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        tabIndex={0}
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>
                  <Button 
                    className="w-full rounded-2xl bg-gradient-to-r from-primary to-primary-hover hover:from-primary-hover hover:to-primary-hover text-white min-h-[52px] h-12 text-base font-semibold mb-5 touch-manipulation shadow-lg shadow-pink-200/40"
                    onClick={handleEmailAuth}
                    disabled={isLoading || !password}
                  >
                    {isLoading 
                      ? (isSignup ? "Creating account…" : "Logging in…") 
                      : (isSignup ? "Sign up" : "Log in")
                    }
                  </Button>
                  <div className="text-center space-y-1">
                    {!isSignup && (
                      <Link
                        href="/forgot-password"
                        onClick={() => setOpen(false)}
                        className="block w-full py-3 text-[15px] text-primary hover:underline font-medium touch-manipulation"
                      >
                        Forgot your password?
                      </Link>
                    )}
                    <button
                      onClick={() => {
                        setShowPasswordField(false);
                        setError(null);
                      }}
                      className="block w-full py-3 text-[15px] text-gray-500 hover:text-gray-900 font-medium touch-manipulation rounded-xl active:bg-gray-100"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        setIsSignup(!isSignup);
                        setError(null);
                      }}
                      className="block w-full py-3 text-[15px] text-gray-600 hover:text-gray-900 font-medium touch-manipulation rounded-xl active:bg-gray-100"
                    >
                      {isSignup ? "Already have an account? Log in" : "Don't have an account? Sign up"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Separator - same as mobile: between phone block and social/email */}
          {!showEmailForm && !otpSent && (
            <div className="flex items-center my-6">
              <div className="flex-grow border-t border-gray-200 rounded-full"></div>
              <span className="flex-shrink mx-4 text-[13px] text-gray-400 font-medium">or</span>
              <div className="flex-grow border-t border-gray-200 rounded-full"></div>
            </div>
          )}

          {/* Social Login Options - order: Google, Apple, Continue with email, Facebook */}
          {!showEmailForm && !otpSent && (
            <>
              <Button
                variant="outline"
                className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                onClick={() => handleSocialLogin("google")}
                disabled={isLoading}
              >
                <FaGoogle className="text-lg shrink-0" />
                <span>Continue with Google</span>
              </Button>
              
              <Button
                variant="outline"
                className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                onClick={() => handleSocialLogin("apple")}
                disabled={isLoading}
              >
                <FaApple className="text-lg shrink-0" />
                <span>Continue with Apple</span>
              </Button>
              
              <Button
                variant="outline"
                className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                onClick={handleEmailButtonClick}
                disabled={isLoading}
              >
                <CiMail className="text-lg shrink-0" />
                <span>Continue with email</span>
              </Button>
              
              <Button
                variant="outline"
                className="w-full mb-3 rounded-2xl flex items-center justify-start gap-3 px-4 min-h-[52px] h-12 hover:bg-gray-50 border-gray-200 text-[15px] font-medium touch-manipulation"
                onClick={() => handleSocialLogin("facebook")}
                disabled={isLoading}
              >
                <FaFacebook className="text-lg text-blue-600 shrink-0" />
                <span>Continue with Facebook</span>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}