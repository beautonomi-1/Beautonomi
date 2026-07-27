import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Shield } from "lucide-react";
import { AdminApiError } from "@beautonomi/admin-api-client";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import {
  listVerifiedTotpFactors,
  startTotpChallenge,
  startTotpEnrollment,
  verifyMfaTotp,
  type TotpEnrollment,
} from "@/lib/adminMfaLogin";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { signOut } from "@/lib/authSignIn";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useAdminDocumentTitle } from "@/hooks/useAdminDocumentTitle";

const MFA_REQUIRED_CODE = "MFA_REQUIRED";

function safeAdminNextParam(raw: string | null): string {
  const t = (raw ?? "").trim();
  if (!t.startsWith("/admin")) return "/admin/dashboard";
  const tail = t.replace(/^\/admin\/?/, "").trim();
  if (!tail) return "/admin/dashboard";
  const segments = tail.split("/").filter(Boolean);
  if (segments.some((s) => s === ".." || s === ".")) return "/admin/dashboard";
  if (tail === "login" || tail.startsWith("login/") || tail === "mfa/enroll") return "/admin/dashboard";
  return `/admin/${tail}`;
}

function QrCodePreview({ value }: { value: string }) {
  if (!value) return null;
  if (value.trim().startsWith("<svg")) {
    return (
      <div
        className="mx-auto flex h-52 w-52 items-center justify-center overflow-hidden rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200 [&_svg]:h-full [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: value }}
        aria-label="Authenticator setup QR code"
      />
    );
  }
  return (
    <img
      src={value}
      alt="Authenticator setup QR code"
      className="mx-auto h-52 w-52 rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200"
    />
  );
}

export function MfaEnrollPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const next = useMemo(() => safeAdminNextParam(params.get("next")), [params]);
  useAdminDocumentTitle("Set up two-factor authentication");

  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [mode, setMode] = useState<"enroll" | "challenge" | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [redirectToLogin, setRedirectToLogin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError("Sign-in client not available.");
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        if (!cancelled) setRedirectToLogin(true);
        return;
      }

      try {
        await adminApi.getBootstrap();
        if (!cancelled) navigate(adminSpaTo(next), { replace: true });
        return;
      } catch (e) {
        if (e instanceof AdminApiError && e.status === 401) {
          if (!cancelled) setRedirectToLogin(true);
          return;
        }
        if (!(e instanceof AdminApiError) || e.code !== MFA_REQUIRED_CODE) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Could not verify your admin session.");
            setLoading(false);
          }
          return;
        }
      }

      try {
        const factors = await listVerifiedTotpFactors(supabase);
        const existing = factors[0];
        if (existing) {
          const challenge = await startTotpChallenge(supabase, existing.id);
          if (challenge.error || !challenge.challengeId) throw challenge.error ?? new Error("Could not start MFA challenge.");
          if (!cancelled) {
            setFactorId(existing.id);
            setChallengeId(challenge.challengeId);
            setMode("challenge");
            setLoading(false);
          }
          return;
        }

        const enrolled = await startTotpEnrollment(supabase);
        if (enrolled.error || !enrolled.data) throw enrolled.error ?? new Error("Could not start MFA enrollment.");
        if (!cancelled) {
          setEnrollment(enrolled.data);
          setFactorId(enrolled.data.factorId);
          setMode("enroll");
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not prepare two-factor authentication.");
          setLoading(false);
        }
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [navigate, next]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const digits = code.replace(/\D/g, "");
    if (digits.length < 6 || !factorId) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Sign-in client not available.");
      let activeChallengeId = challengeId;
      if (!activeChallengeId) {
        const challenge = await startTotpChallenge(supabase, factorId);
        if (challenge.error || !challenge.challengeId) throw challenge.error ?? new Error("Could not start MFA verification.");
        activeChallengeId = challenge.challengeId;
        setChallengeId(activeChallengeId);
      }
      const { error: verifyError } = await verifyMfaTotp(supabase, factorId, activeChallengeId, digits);
      if (verifyError) throw verifyError;
      await qc.invalidateQueries({ queryKey: adminQueryKeys.root });
      navigate(adminSpaTo(next), { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code. Try again.");
    } finally {
      setVerifying(false);
    }
  }

  if (redirectToLogin) {
    return <Navigate to={adminSpaTo(`/admin/login?next=${encodeURIComponent(next)}`)} replace />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        <h1 className="text-center text-2xl font-bold text-gray-900">Two-factor authentication</h1>
        <p className="mt-1 text-center text-sm text-gray-500">Protect the Beautonomi administrator portal.</p>

        {loading ? <p className="mt-6 text-center text-sm text-gray-500">Preparing MFA…</p> : null}

        {error ? (
          <div className="mt-6 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        ) : null}

        {!loading && mode === "enroll" ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-gray-700">
              <p className="flex items-center gap-2 font-medium text-gray-900">
                <Shield className="h-4 w-4" aria-hidden />
                Set up an authenticator app
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Scan the QR code with Microsoft Authenticator, Google Authenticator, 1Password, Bitwarden, Authy, or any TOTP app.
              </p>
            </div>
            <QrCodePreview value={enrollment?.qrCode ?? ""} />
            {enrollment?.secret ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Manual setup key</label>
                <code className="block break-all rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                  {enrollment.secret}
                </code>
              </div>
            ) : null}
          </div>
        ) : null}

        {!loading && mode === "challenge" ? (
          <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-gray-700">
            <p className="font-medium text-gray-900">Authenticator code required</p>
            <p className="mt-1 text-xs text-gray-600">Enter the 6-digit code from your enrolled authenticator app.</p>
          </div>
        ) : null}

        {!loading && mode ? (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="mfa-code" className="mb-1 block text-xs font-medium text-gray-700">
                One-time password
              </label>
              <input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={12}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm tracking-widest focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="000000"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={verifying || code.length < 6}
              className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
            >
              {verifying ? "Verifying…" : mode === "enroll" ? "Verify and finish setup" : "Verify and continue"}
            </button>
          </form>
        ) : null}

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700"
          onClick={async () => {
            await signOut();
            setRedirectToLogin(true);
          }}
        >
          Cancel and use a different account
        </button>
      </div>
    </div>
  );
}
