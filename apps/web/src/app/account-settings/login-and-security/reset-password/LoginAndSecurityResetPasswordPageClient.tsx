"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { updatePassword } from "@/lib/supabase/auth";
import { getSupabaseClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");

    const tryReady = () => setIsReady(true);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          tryReady();
        }
      }
    );

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        tryReady();
        return;
      }
      if (tokenHash && type === "recovery") {
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (verifyErr) {
          setVerifyError(verifyErr.message);
          return;
        }
        tryReady();
        window.history.replaceState({}, "", window.location.pathname);
      }
    })();

    return () => subscription.unsubscribe();
  }, [searchParams]);

  const passwordStrength = (pwd: string): { label: string; color: string; score: number } => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 1) return { label: "Weak", color: "bg-red-500", score };
    if (score <= 3) return { label: "Fair", color: "bg-yellow-500", score };
    return { label: "Strong", color: "bg-green-500", score };
  };

  const strength = passwordStrength(newPassword);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      await updatePassword(newPassword);
      setSuccess(true);
      toast.success("Password updated successfully");
      setTimeout(() => router.push("/"), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div
          className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-lg"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-gray-900">
            Password Updated
          </h2>
          <p className="text-sm text-gray-500">
            Your password has been reset successfully. Redirecting you to the
            home page…
          </p>
        </div>
      </div>
    );
  }

  if (verifyError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div
          className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-8 text-center shadow-lg"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <AlertCircle className="h-7 w-7 text-red-600" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Invalid or expired link</h2>
          <p className="mb-6 text-sm text-gray-500">{verifyError}</p>
          <Button onClick={() => router.push("/forgot-password")} className="w-full mb-2">Request new link</Button>
          <button type="button" onClick={() => router.push("/")} className="text-sm text-gray-500 hover:text-gray-700">Back to home</button>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div
          className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-lg"
        >
          <p className="mx-auto mb-4 text-sm text-gray-500">Loading…</p>
          <p className="text-sm text-gray-500">
            Verifying your reset link…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-8">
      <div
        className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-lg"
      >
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50">
          <Lock className="h-6 w-6 text-gray-700" />
        </div>

        <h1 className="mb-1 text-center text-xl font-semibold text-gray-900">
          Set a New Password
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          Choose a strong password for your account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              New Password
            </label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {newPassword.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full ${
                        i <= strength.score ? strength.color : "bg-gray-200"
                      }`}
                    />
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Strength: {strength.label}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Confirm Password
            </label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={isSubmitting || !newPassword || !confirmPassword}
            className="w-full"
          >
            {isSubmitting ? "Updating…" : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
