"use client";
import React, { useState, useEffect } from "react";
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
import { FaApple, FaFacebook, FaGoogle } from "react-icons/fa6";
import { CiMail } from "react-icons/ci";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { signIn as signInAuth, signUp as signUpAuth, signInWithOAuth, resendVerificationEmail } from "@/lib/supabase/auth";
import { toast } from "sonner";

interface InlineSignupFormProps {
  redirectContext?: "provider" | "customer";
  onAuthSuccess?: () => void;
  redirectUrl?: string;
}

export default function InlineSignupForm({ redirectContext, onAuthSuccess, redirectUrl }: InlineSignupFormProps) {
  const router = useRouter();
  const { refreshUser, role: _contextRole, user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(true); // Start with email form for signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+27");
  const [error, setError] = useState<string | null>(null);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);

  // Close form and call onAuthSuccess when user becomes authenticated
  useEffect(() => {
    if (user && onAuthSuccess) {
      setTimeout(() => {
        onAuthSuccess();
      }, 300);
    }
  }, [user, onAuthSuccess]);

  const handleEmailContinue = () => {
    if (!email) {
      setError("Email is required");
      return;
    }
    setShowPasswordField(true);
    setError(null);
  };

  const handleEmailAuth = async () => {
    setError(null);
    setShowResendVerification(false);
    
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError("Email and password are required");
      return;
    }

    setIsLoading(true);
    setError(null);
    setShowResendVerification(false);

    try {
      // Sign up new user
      if (!fullName) {
        setError("Full name is required");
        setIsLoading(false);
        return;
      }

      const userRole = redirectContext === "provider" ? "provider_owner" : "customer";

      const signupResult = await signUpAuth({
        email: trimmedEmail,
        password: trimmedPassword,
        fullName: fullName?.trim(),
        phone: phone ? `${countryCode}${phone}` : undefined,
        role: userRole,
      });

      if (signupResult?.session) {
        toast.success("Account created successfully! Welcome to Beautonomi.");
        await refreshUser();
        await new Promise(resolve => setTimeout(resolve, 300));
        
        if (onAuthSuccess) {
          onAuthSuccess();
          return;
        }
        
        if (redirectContext === "provider") {
          router.push("/provider/onboarding");
        } else if (redirectUrl) {
          router.push(redirectUrl);
        } else {
          // For customers, redirect to onboarding flow
          router.push("/onboarding");
        }
      } else if (signupResult?.user) {
        try {
          const loginResult = await signInAuth({ email: trimmedEmail, password: trimmedPassword });
          
          if (loginResult?.session) {
            toast.success("Account created successfully! Welcome to Beautonomi.");
            await refreshUser();
            await new Promise(resolve => setTimeout(resolve, 300));
            
            if (onAuthSuccess) {
              onAuthSuccess();
              return;
            }
            
            if (redirectContext === "provider") {
              router.push("/provider/onboarding");
            } else if (redirectUrl) {
              router.push(redirectUrl);
            } else {
              // For customers, redirect to onboarding flow
              router.push("/onboarding");
            }
          } else {
            throw new Error("Email verification required");
          }
        } catch (loginError: any) {
          console.log("Auto-login after signup failed, email verification is required:", loginError);
          toast.success(
            "Account created! Please check your email to verify your account. You'll be able to log in after verification.",
            { duration: 6000 }
          );
          setShowResendVerification(true);
          setShowPasswordField(true);
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
      await resendVerificationEmail(email.trim());
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

  const handlePhoneAuth = async () => {
    if (!phone) {
      setError("Phone number is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
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
      const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
      await signInWithOAuth(provider, currentUrl);
      toast.info(`Redirecting to ${provider}...`);
    } catch (error: any) {
      console.error("OAuth error:", error);
      setError(error.message || `Failed to sign in with ${provider}`);
      toast.error(error.message || `Failed to sign in with ${provider}`);
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
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

      {/* Email Form */}
      {showEmailForm && (
        <>
          {/* Step 1: Email Input */}
          {!showPasswordField && (
            <>
              <div className="mb-4">
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Full name</Label>
                <Input
                  type="text"
                  className="text-base h-12 border-gray-300"
                  placeholder="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="mb-6">
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Email</Label>
                <Input
                  type="email"
                  className="text-base h-12 border-gray-300"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
              <Button 
                className="w-full bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white h-12 text-base font-medium mb-6"
                onClick={handleEmailContinue}
                disabled={isLoading || !email || !fullName}
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

          {/* Step 2: Password Input */}
          {showPasswordField && (
            <>
              <div className="mb-4">
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Password</Label>
                <Input
                  type="password"
                  className="text-base h-12 border-gray-300"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) {
                      setError(null);
                      setShowResendVerification(false);
                    }
                  }}
                  autoComplete="new-password"
                />
              </div>
              <Button 
                className="w-full bg-gradient-to-r from-[#FF0077] to-[#D60565] hover:from-[#E6006A] hover:to-[#C00555] text-white h-12 text-base font-medium mb-4"
                onClick={handleEmailAuth}
                disabled={isLoading || !password}
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
              setShowEmailForm(true);
              setError(null);
            }}
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
  );
}
