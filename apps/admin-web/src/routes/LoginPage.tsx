import { useState, useEffect, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Shield } from "lucide-react";
import { AdminApiError } from "@beautonomi/admin-api-client";
import { ALL_ADMIN_ROLES } from "@beautonomi/admin-access";
import type { UserRole } from "@beautonomi/types";
import { signInWithPassword, signOut } from "@/lib/authSignIn";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  prepareMfaStepAfterPassword,
  verifyMfaTotp,
  refreshMfaChallenge,
} from "@/lib/adminMfaLogin";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";

/** SPA-internal path only (no scheme/host); rejects traversal. */
function safeAdminNextParam(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("/admin")) return "dashboard";
  const tail = t.replace(/^\/admin\/?/, "").trim();
  if (!tail) return "dashboard";
  const segments = tail.split("/").filter(Boolean);
  if (segments.some((s) => s === ".." || s === ".")) return "dashboard";
  const path = segments.join("/");
  if (path === "login" || path.startsWith("login/")) return "dashboard";
  return path;
}

interface MfaPolicy {
  two_factor_enabled: boolean;
  two_factor_required_for_admins: boolean;
}

async function fetchMfaPolicy(): Promise<MfaPolicy> {
  try {
    const res = await fetch("/api/auth/mfa-policy", { credentials: "include" });
    const json = (await res.json()) as { data?: MfaPolicy };
    return {
      two_factor_enabled: json?.data?.two_factor_enabled ?? false,
      two_factor_required_for_admins: json?.data?.two_factor_required_for_admins ?? false,
    };
  } catch {
    return { two_factor_enabled: false, two_factor_required_for_admins: false };
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const { bootstrap, isLoading: sessionLoading, isError, errorStatus } = useAdminSession();
  useAdminDocumentTitle("Sign in");

  const fromState = (location.state as { from?: string } | null)?.from;
  const rawNext = params.get("next") || fromState || "";
  const safeNext = safeAdminNextParam(rawNext);
  const enrollNext = encodeURIComponent(`/admin/${safeNext}`);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [mfaPolicy, setMfaPolicy] = useState<MfaPolicy | null>(null);
  const [mfaStep, setMfaStep] = useState<"password" | "otp">("password");
  const [otp, setOtp] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  useEffect(() => {
    void fetchMfaPolicy().then(setMfaPolicy);
  }, []);

  if (!sessionLoading && bootstrap && !isError) {
    return <Navigate to={adminSpaTo(`/admin/${safeNext}`)} replace />;
  }

  async function completeLoginAfterSession() {
    try {
      const b = await adminApi.getBootstrap();
      const role = b.role as UserRole;
      if (!ALL_ADMIN_ROLES.includes(role)) {
        setFormError("Access denied. This area is for administrators only.");
        await signOut();
        setLoading(false);
        return;
      }
      await qc.invalidateQueries({ queryKey: adminQueryKeys.root });
      navigate(adminSpaTo(`/admin/${safeNext}`), { replace: true });
    } catch (e) {
      if (e instanceof AdminApiError && e.code === "MFA_REQUIRED") {
        navigate(adminSpaTo(`/admin/mfa/enroll?next=${enrollNext}`), { replace: true });
        setLoading(false);
        return;
      }
      setFormError(e instanceof Error ? e.message : "Could not load admin session.");
      await signOut();
      setLoading(false);
    }
  }

  async function enforcePolicyAndMfa(supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>) {
    const policy = mfaPolicy ?? (await fetchMfaPolicy());

    const mfa = (supabase.auth as unknown as { mfa?: { listFactors?: () => Promise<unknown> } }).mfa;
    if (policy.two_factor_required_for_admins && mfa?.listFactors) {
      const lf = (await mfa.listFactors()) as {
        data?: { totp?: Array<{ status: string }> } | null;
      };
      const hasVerifiedTotp = (lf.data?.totp ?? []).some((f) => f.status === "verified");
      if (!hasVerifiedTotp) {
        navigate(adminSpaTo(`/admin/mfa/enroll?next=${enrollNext}`), { replace: true });
        return;
      }
    }

    const step = await prepareMfaStepAfterPassword(supabase);
    if (step.kind === "enrollment_required") {
      await signOut();
      setFormError(step.message);
      setLoading(false);
      return;
    }
    if (step.kind === "totp") {
      setFactorId(step.factorId);
      setChallengeId(step.challengeId);
      setMfaStep("otp");
      setOtp("");
      setLoading(false);
      return;
    }

    await completeLoginAfterSession();
    setLoading(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const em = email.trim();
    if (!em || !password) {
      setFormError("Enter email and password.");
      return;
    }
    setLoading(true);
    try {
      await signInWithPassword({ email: em, password });
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setFormError("Sign-in client not available.");
        setLoading(false);
        return;
      }
      await enforcePolicyAndMfa(supabase);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Sign in failed.");
      setLoading(false);
    }
  }

  async function onSubmitOtp(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const code = otp.trim();
    if (!code || !factorId || !challengeId) {
      setFormError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setFormError("Session lost. Please sign in again.");
      setMfaStep("password");
      return;
    }
    setLoading(true);
    try {
      const { error } = await verifyMfaTotp(supabase, factorId, challengeId, code);
      if (error) {
        setFormError(error.message || "Invalid code. Try again.");
        setLoading(false);
        return;
      }
      await completeLoginAfterSession();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  async function requestNewChallenge() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !factorId) return;
    setFormError(null);
    setLoading(true);
    try {
      const next = await refreshMfaChallenge(supabase, factorId);
      if (next?.challengeId) {
        setChallengeId(next.challengeId);
        setFormError(null);
      } else {
        setFormError("Could not refresh verification. Try signing in again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        <h1 className="text-center text-2xl font-bold text-gray-900">Admin sign in</h1>
        <p className="mt-1 text-center text-sm text-gray-500">Beautonomi administrator portal (SPA)</p>

        {mfaPolicy?.two_factor_enabled ? (
          <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-primary">
            <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Two-factor authentication may be required after sign-in.
          </p>
        ) : null}

        {sessionLoading && !bootstrap && !isError && errorStatus !== 401 ? (
          <p className="mt-6 text-center text-sm text-gray-500">Checking session…</p>
        ) : null}

        {formError ? (
          <div
            className="mt-6 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            <AlertCircle className="h-5 w-5 shrink-0" />
            {formError}
          </div>
        ) : null}

        {mfaStep === "password" ? (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmitOtp} className="mt-6 space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-gray-700">
              <p className="font-medium text-gray-900">Authenticator code</p>
              <p className="mt-1 text-xs text-gray-600">
                Enter the 6-digit code from your authenticator app (TOTP).
              </p>
            </div>
            <div>
              <label htmlFor="otp" className="mb-1 block text-xs font-medium text-gray-700">
                One-time password
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm tracking-widest focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="000000"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Verify and continue"}
            </button>
            <button
              type="button"
              className="w-full text-center text-sm text-primary underline hover:text-primary/80"
              onClick={() => void requestNewChallenge()}
              disabled={loading}
            >
              New code challenge
            </button>
            <button
              type="button"
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
              onClick={async () => {
                await signOut();
                setMfaStep("password");
                setFactorId(null);
                setChallengeId(null);
                setOtp("");
                setFormError(null);
              }}
            >
              Cancel and use a different account
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
