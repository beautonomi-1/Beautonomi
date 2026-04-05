"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/providers/AuthProvider";
import { signIn as signInAuth } from "@/lib/supabase/auth";
import { ALL_ADMIN_ROLES } from "@/lib/admin-sections";
import { toast } from "sonner";
import logo from "../../../../public/images/logo.svg";

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, role: contextRole, isLoading, refreshUser, signOut } = useAuth();
  const nextParam = searchParams.get("next") || "";
  const safeNext = nextParam.startsWith("/admin") ? nextParam : "";

  useEffect(() => {
    if (isLoading) return;
    if (user && contextRole && ALL_ADMIN_ROLES.includes(contextRole)) {
      router.replace(safeNext || "/admin/dashboard");
    }
  }, [user, contextRole, isLoading, router, safeNext]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError("Please enter your email");
      return;
    }
    if (!password) {
      setFormError("Please enter your password");
      return;
    }
    setLoading(true);
    try {
      await signInAuth({ email: trimmedEmail, password });
      setFormError(null);
      let updatedUser = await refreshUser();
      let retries = 0;
      while (!updatedUser && retries < 2) {
        await new Promise((r) => setTimeout(r, 500));
        updatedUser = await refreshUser();
        retries++;
      }
      const userRole = updatedUser?.role ?? contextRole;
      if (!userRole || !ALL_ADMIN_ROLES.includes(userRole)) {
        setFormError("Access denied. This area is for administrators only.");
        await signOut();
        setLoading(false);
        return;
      }
      toast.success("Signed in successfully.");
      router.replace(safeNext || "/admin/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign in failed. Please try again.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="inline-block mb-8" aria-label="Beautonomi home">
          <Image src={logo} alt="Beautonomi" className="h-8 w-auto" />
        </Link>
        <div className="rounded-2xl p-6 mb-2 bg-[rgba(255,0,119,0.06)]">
          <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-2 bg-white/90">
            <span className="text-2xl text-primary" aria-hidden>◆</span>
          </div>
        </div>
        <h1 className="text-center text-[28px] font-extrabold text-gray-900 mb-1" id="admin-login-heading">
          Admin sign in
        </h1>
        <p className="text-center text-[14px] text-gray-500 mb-7">
          Sign in with your administrator account
        </p>

        {formError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 mb-4" role="alert">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{formError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="admin-login-email" className="text-xs font-medium text-gray-700 mb-1.5 block">
              Email
            </Label>
            <div className="flex items-center rounded-xl border border-gray-200 bg-gray-100 px-3.5 gap-2.5">
              <Mail className="h-[18px] w-[18px] text-gray-400 flex-shrink-0" aria-hidden />
              <Input
                id="admin-login-email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 border-0 bg-transparent h-12 px-2.5 text-[13px] text-gray-700 placeholder:text-gray-400 focus-visible:ring-0"
                autoComplete="email"
                inputMode="email"
                onKeyDown={(e) => e.key === "Enter" && passwordRef.current?.focus()}
                aria-required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="admin-login-password" className="text-xs font-medium text-gray-700 mb-1.5 block">
              Password
            </Label>
            <div className="flex items-center rounded-xl border border-gray-200 bg-gray-100 px-3.5 gap-2.5">
              <Lock className="h-[18px] w-[18px] text-gray-400 flex-shrink-0" aria-hidden />
              <Input
                ref={passwordRef}
                id="admin-login-password"
                type={showPassword ? "text" : "password"}
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 border-0 bg-transparent h-12 px-2.5 pr-8 text-[13px] text-gray-700 placeholder:text-gray-400 focus-visible:ring-0"
                autoComplete="current-password"
                aria-required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="p-1 rounded text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <Link
            href={safeNext ? `/forgot-password?next=${encodeURIComponent(safeNext)}` : "/forgot-password"}
            className="block text-sm text-gray-500 hover:text-primary text-center mt-1"
          >
            Forgot password? <span className="font-semibold text-primary">Reset it</span>
          </Link>
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl text-base font-bold bg-primary hover:bg-primary-hover text-white"
          >
            {loading ? (
              <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden />
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          <Link href="/login" className="text-primary hover:underline font-medium">
            Back to main site
          </Link>
        </p>
      </div>
    </div>
  );
}
