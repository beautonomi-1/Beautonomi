"use client";

/**
 * Embed entry for provider app in-app WebView.
 * Waits for session to be injected by the app (window.__providerAppSession), then sets session and redirects to path.
 * Used so providers can view any provider portal page inside the app without leaving it.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";

declare global {
  interface Window {
    __providerAppSession?: { access_token: string; refresh_token: string };
    __providerAppSessionReady?: () => void;
  }
}

export default function ProviderEmbedPage() {
  const searchParams = useSearchParams();
  const path = searchParams.get("path") || "/provider/dashboard";
  const [status, setStatus] = useState<"waiting" | "setting" | "redirecting" | "error">("waiting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus("error");
      setErrorMsg("Client not available");
      return;
    }

    const getSessionFromHash = (): { access_token: string; refresh_token: string } | null => {
      const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
      if (!hash) return null;
      try {
        const decoded = decodeURIComponent(hash);
        const data = JSON.parse(decoded) as { access_token?: string; refresh_token?: string };
        if (data?.access_token && data?.refresh_token) return { access_token: data.access_token, refresh_token: data.refresh_token };
      } catch {
        // ignore
      }
      return null;
    };

    const applySession = async (): Promise<boolean> => {
      const session = getSessionFromHash() || window.__providerAppSession;
      if (!session?.access_token || !session.refresh_token) return false;
      setStatus("setting");
      try {
        const { error } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (cancelled) return true;
        if (error) {
          setStatus("error");
          setErrorMsg(error.message);
          return true;
        }
        setStatus("redirecting");
        const target = path.startsWith("/") ? path : `/${path}`;
        window.location.replace(target);
        return true;
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setErrorMsg(e instanceof Error ? e.message : "Failed to set session");
        }
        return true;
      }
    };

    const timeoutMs = 12_000;
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      setStatus("error");
      setErrorMsg("Session not received. Open this from the provider app while signed in, or use the link below.");
    }, timeoutMs);

    let checkId: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (await applySession()) return;
      if (cancelled) return;
      checkId = setTimeout(check, 200);
    };
    checkId = setTimeout(check, 100);

    return () => {
      cancelled = true;
      clearTimeout(checkId);
      clearTimeout(timeoutId);
    };
  }, [path]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      {status === "waiting" && (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#FF0077] border-t-transparent" />
          <p className="mt-4 text-gray-600">Loading session from app…</p>
        </>
      )}
      {status === "setting" && (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#FF0077] border-t-transparent" />
          <p className="mt-4 text-gray-600">Signing you in…</p>
        </>
      )}
      {status === "redirecting" && (
        <>
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#FF0077] border-t-transparent" />
          <p className="mt-4 text-gray-600">Redirecting…</p>
        </>
      )}
      {status === "error" && (
        <>
          <p className="text-red-600">{errorMsg || "Something went wrong."}</p>
          <a href="/provider" className="mt-4 text-[#FF0077] underline">Open provider portal</a>
        </>
      )}
    </div>
  );
}
