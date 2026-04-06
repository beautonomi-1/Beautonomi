import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { ALL_ADMIN_ROLES } from "@beautonomi/admin-access";
import type { UserRole } from "@beautonomi/types";
import { signInWithPassword } from "@/lib/authSignIn";
import { useAdminSession } from "@/providers/AdminSessionProvider";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";

/** SPA-internal path only (no scheme/host); rejects traversal. */
function safeAdminNextParam(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("/admin")) return "dashboard";
  const tail = t.replace(/^\/admin\/?/, "").trim();
  if (!tail) return "dashboard";
  const segments = tail.split("/").filter(Boolean);
  if (segments.some((s) => s === ".." || s === ".")) return "dashboard";
  const path = segments.join("/");
  // Avoid redirect loop: logged-in users hitting /login with next=/admin/login would stay on login.
  if (path === "login" || path.startsWith("login/")) return "dashboard";
  return path;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const { bootstrap, isLoading: sessionLoading, isError, errorStatus } = useAdminSession();

  const fromState = (location.state as { from?: string } | null)?.from;
  const rawNext = params.get("next") || fromState || "";
  const safeNext = safeAdminNextParam(rawNext);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!sessionLoading && bootstrap && !isError) {
    return <Navigate to={`/${safeNext}`.replace(/\/+/g, "/")} replace />;
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
      const b = await adminApi.getBootstrap();
      const role = b.role as UserRole;
      if (!ALL_ADMIN_ROLES.includes(role)) {
        setFormError("Access denied. This area is for administrators only.");
        setLoading(false);
        return;
      }
      await qc.invalidateQueries({ queryKey: adminQueryKeys.root });
      navigate(`/${safeNext}`.replace(/\/+/g, "/"), { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        <h1 className="text-center text-2xl font-bold text-gray-900">Admin sign in</h1>
        <p className="mt-1 text-center text-sm text-gray-500">Beautonomi administrator portal (SPA)</p>

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

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm"
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
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gray-900 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
