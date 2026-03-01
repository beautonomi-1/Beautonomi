"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { FaApple, FaFacebook, FaGoogle } from "react-icons/fa6";
import { CiMail } from "react-icons/ci";
import { X, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { signIn as signInAuth, signUp as signUpAuth, signInWithOAuth, resendVerificationEmail } from "@/lib/supabase/auth";
import { toast } from "sonner";


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
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+27");
  const [error, setError] = useState<string | null>(null);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      setPhone("");
      setShowResendVerification(false);
      setShowPassword(false);
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
          phone: phone ? `${countryCode}${phone}` : undefined,
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
          } catch (loginError: any) {
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
          // Role not loaded yet: if provider context, redirect to dashboard so RoleGuard can show loading
          if (redirectContext === "provider") {
            setError(null);
            setOpen(false);
            toast.success("Logged in successfully!");
            router.replace("/provider/dashboard");
          } else {
            const errorMsg = "Login successful, but unable to load user profile. Please refresh the page.";
            setError(errorMsg);
            toast.error(errorMsg);
          }
          setIsLoading(false);
        }
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      const errorMessage = error.message || "Authentication failed. Please try again.";
      
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
    } catch (error: any) {
      console.error("Error resending verification email:", error);
      const errorMessage = error.message || "Failed to send verification email.";
      
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

  const handlePhoneAuth = async () => {
    if (!phone) {
      setError("Phone number is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const _fullPhone = `${countryCode}${phone}`;
      // For phone auth, we'll use email/password flow with phone as identifier
      // In production, you'd implement proper phone OTP flow
      toast.info("Phone authentication coming soon. Please use email for now.");
      setShowEmailForm(true);
    } catch (error: any) {
      setError(error.message || "Phone authentication failed");
      toast.error(error.message || "Phone authentication failed");
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
    } catch (error: any) {
      console.error("OAuth error:", error);
      setError(error.message || `Failed to sign in with ${provider}`);
      toast.error(error.message || `Failed to sign in with ${provider}`);
      setIsLoading(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-full max-w-[95vw] sm:max-w-[575px] m-0 sm:m-4 p-0 z-[9999] overflow-auto max-h-[90vh] sm:max-h-[80vh] rounded-none sm:rounded-lg bg-white">
        <DialogHeader className="border-b border-gray-300 px-4 sm:px-6 py-3 sm:py-4 relative">
          <button
            onClick={() => setOpen(false)}
            className="absolute left-3 sm:left-4 top-3 sm:top-4 text-gray-500 hover:text-gray-700 p-1 touch-manipulation"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <DialogTitle className="text-center text-base sm:text-lg font-semibold">
            Log in or sign up
          </DialogTitle>
          <DialogDescription className="sr-only">
            Log in or create a new Beautonomi account to access all features
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 sm:mt-6 px-4 sm:px-6 pb-4 sm:pb-6">
          <h2 className="text-xl sm:text-2xl font-bold mb-6 sm:mb-8">Welcome to Beautonomi</h2>
          
          {/* Error Message */}
          {error && (
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
              {/* Country Code and Phone Number - Integrated Design */}
              <div className="mb-4">
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <div className="border-b border-gray-300 px-4 py-2 bg-gray-50">
                    <Label className="text-xs font-medium text-gray-700">Country code</Label>
                    <Select value={countryCode} onValueChange={setCountryCode}>
                      <SelectTrigger className="w-full border-none px-0 pt-1 text-base font-semibold bg-transparent h-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="+27">South Africa (+27)</SelectItem>
                        <SelectItem value="+254">Kenya (+254)</SelectItem>
                        <SelectItem value="+233">Ghana (+233)</SelectItem>
                        <SelectItem value="+234">Nigeria (+234)</SelectItem>
                        <SelectItem value="+20">Egypt (+20)</SelectItem>
                        <SelectItem value="+1">USA (+1)</SelectItem>
                        <SelectItem value="+44">UK (+44)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="px-4 py-3">
                    <Input
                      type="tel"
                      className="text-base border-0 px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                      placeholder="Phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                      inputMode="tel"
                    />
                  </div>
                </div>
              </div>
              
              <p className="text-xs text-gray-600 mb-6">
                {"We'll"} call or text you to confirm your number. Standard message and data rates apply.{" "}
                <span className="font-semibold underline cursor-pointer hover:text-gray-900">Privacy Policy</span>
              </p>
              
              <Button 
                className="w-full bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white h-12 text-base font-medium mb-6"
                onClick={handlePhoneAuth}
                disabled={isLoading}
              >
                {isLoading ? "Processing..." : "Continue"}
              </Button>
            </>
          )}

          {/* Email Form (shown when "Continue with email" is clicked) */}
          {showEmailForm && (
            <>
              {/* Step 1: Email Input (or both email and password for login mode) */}
              {!showPasswordField && (
                <>
                  {isSignup && (
                    <div className="mb-4">
                      <Label className="text-sm font-medium text-gray-700 mb-2 block">Full name</Label>
                      <Input
                        type="text"
                        className="text-base h-12 border-gray-300"
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
                      className="text-base h-12 border-gray-300"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && email && !isLoading) {
                          if (initialMode === "login") {
                            // In login mode, focus password field if it exists, otherwise continue
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
                    <div className="mb-6">
                      <Label className="text-sm font-medium text-gray-700 mb-2 block">Password</Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          className="text-base h-12 border-gray-300 pr-10"
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
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FF0077] rounded p-1"
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
                  <Button 
                    className="w-full bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white h-12 text-base font-medium mb-6"
                    onClick={!isSignup ? handleEmailAuth : handleEmailContinue}
                    disabled={isLoading || !email || (!isSignup && !password)}
                  >
                    {!isSignup ? (isLoading ? "Logging in..." : "Log in") : "Continue"}
                  </Button>
                  
                  {/* Separator */}
                  <div className="flex items-center my-6">
                    <div className="flex-grow border-t border-gray-300"></div>
                    <span className="flex-shrink mx-4 text-sm text-gray-600">or</span>
                    <div className="flex-grow border-t border-gray-300"></div>
                  </div>

                  {/* Social Login Options */}
                  <Button
                    variant="outline"
                    className="w-full mb-3 flex items-center justify-start gap-3 px-4 h-12 hover:bg-gray-50 border-gray-300 text-base"
                    onClick={() => handleSocialLogin("google")}
                    disabled={isLoading}
                  >
                    <FaGoogle className="text-lg" />
                    <span>Continue with Google</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full mb-3 flex items-center justify-start gap-3 px-4 h-12 hover:bg-gray-50 border-gray-300 text-base"
                    onClick={() => handleSocialLogin("apple")}
                    disabled={isLoading}
                  >
                    <FaApple className="text-lg" />
                    <span>Continue with Apple</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full mb-3 flex items-center justify-start gap-3 px-4 h-12 hover:bg-gray-50 border-gray-300 text-base"
                    onClick={() => {
                      setShowEmailForm(false);
                      setError(null);
                    }}
                    disabled={isLoading}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>Continue with Phone</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full mb-3 flex items-center justify-start gap-3 px-4 h-12 hover:bg-gray-50 border-gray-300 text-base"
                    onClick={() => handleSocialLogin("facebook")}
                    disabled={isLoading}
                  >
                    <FaFacebook className="text-lg text-blue-600" />
                    <span>Continue with Facebook</span>
                  </Button>

                  {/* Need help link */}
                  <div className="text-center mt-6">
                    <button
                      onClick={() => {
                        window.open("/help", "_blank");
                      }}
                      className="text-sm text-gray-600 hover:text-gray-900 underline"
                    >
                      Need help?
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Password Input (after email is entered) */}
              {showPasswordField && (
                <>
                  <div className="mb-4">
                    <Label className="text-sm font-medium text-gray-700 mb-2 block">Password</Label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        className="text-base h-12 border-gray-300 pr-10"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          // Clear error when user starts typing
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
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FF0077] rounded p-1"
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
                    className="w-full bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white h-12 text-base font-medium mb-4"
                    onClick={handleEmailAuth}
                    disabled={isLoading || !password}
                  >
                    {isLoading 
                      ? (isSignup ? "Creating account..." : "Logging in...") 
                      : (isSignup ? "Sign up" : "Log in")
                    }
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
                    <button
                      onClick={() => {
                        setIsSignup(!isSignup);
                        setError(null);
                      }}
                      className="block w-full text-sm text-gray-600 hover:text-gray-900 hover:underline"
                    >
                      {isSignup ? "Already have an account? Log in" : "Don't have an account? Sign up"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Separator */}
          {!showEmailForm && (
            <div className="flex items-center my-6">
              <div className="flex-grow border-t border-gray-300"></div>
              <span className="flex-shrink mx-4 text-sm text-gray-600">or</span>
              <div className="flex-grow border-t border-gray-300"></div>
            </div>
          )}

          {/* Social Login Options */}
          {!showEmailForm && (
            <>
              <Button
                variant="outline"
                className="w-full mb-3 flex items-center justify-start gap-3 px-4 h-12 hover:bg-gray-50 border-gray-300 text-base"
                onClick={() => handleSocialLogin("google")}
                disabled={isLoading}
              >
                <FaGoogle className="text-lg" />
                <span>Continue with Google</span>
              </Button>
              
              <Button
                variant="outline"
                className="w-full mb-3 flex items-center justify-start gap-3 px-4 h-12 hover:bg-gray-50 border-gray-300 text-base"
                onClick={() => handleSocialLogin("apple")}
                disabled={isLoading}
              >
                <FaApple className="text-lg" />
                <span>Continue with Apple</span>
              </Button>
              
              <Button
                variant="outline"
                className="w-full mb-3 flex items-center justify-start gap-3 px-4 h-12 hover:bg-gray-50 border-gray-300 text-base"
                onClick={handleEmailButtonClick}
                disabled={isLoading}
              >
                <CiMail className="text-lg" />
                <span>Continue with email</span>
              </Button>
              
              <Button
                variant="outline"
                className="w-full mb-3 flex items-center justify-start gap-3 px-4 h-12 hover:bg-gray-50 border-gray-300 text-base"
                onClick={() => handleSocialLogin("facebook")}
                disabled={isLoading}
              >
                <FaFacebook className="text-lg text-blue-600" />
                <span>Continue with Facebook</span>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}