"use client";

/**
 * Sumsub verification embed – for mobile app WebView.
 * No auth required. Token and refresh_token are passed in the URL hash (not sent to server).
 * Loads Sumsub Web SDK and runs verification; refresh callback uses public /api/provider/verification/sumsub/refresh.
 */

import React, { useEffect, useRef, useState } from "react";

function parseHash(hash: string): { token?: string; refresh_token?: string } {
  const params: Record<string, string> = {};
  if (hash.startsWith("#")) hash = hash.slice(1);
  hash.split("&").forEach((pair) => {
    const [k, v] = pair.split("=").map(decodeURIComponent);
    if (k && v) params[k] = v;
  });
  return { token: params.token, refresh_token: params.refresh_token };
}

export default function SumsubEmbedPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("loading");

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const { token, refresh_token } = parseHash(hash);

    if (!token) {
      setError("Missing verification token. Please start verification from the app.");
      setStatus("error");
      return;
    }

    let cancelled = false;

    const script = document.createElement("script");
    script.src = "https://static.sumsub.com/idensic/static/sns-websdk-builder.js";
    script.async = true;
    script.onload = () => {
      if (cancelled) return;
      const w = window as Window & { snsWebSdk?: { init: (token: string, refreshCb: () => Promise<string>) => void } };
      if (!w.snsWebSdk?.init || !containerRef.current) {
        setError("Verification SDK failed to load.");
        setStatus("error");
        return;
      }
      const refreshCb = (): Promise<string> => {
        if (!refresh_token) return Promise.resolve(token);
        return fetch(
          `${window.location.origin}/api/provider/verification/sumsub/refresh?refresh_token=${encodeURIComponent(refresh_token)}`
        )
          .then((r) => r.json())
          .then((data) => data?.data?.access_token ?? data?.access_token ?? "")
          .catch(() => token);
      };
      try {
        w.snsWebSdk.init(token, refreshCb);
        setStatus("ready");
      } catch (e) {
        setError("Could not start verification. Try again from the app.");
        setStatus("error");
      }
    };
    script.onerror = () => {
      if (!cancelled) {
        setError("Verification service failed to load. Check your connection and try again.");
        setStatus("error");
      }
    };
    document.body.appendChild(script);
    return () => {
      cancelled = true;
      script.remove();
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 16 }}>
      <div ref={containerRef} id="sumsub-websdk-container" style={{ minHeight: 400 }} />
      {status === "loading" && (
        <p style={{ textAlign: "center", color: "#64748b", marginTop: 24 }}>Loading verification…</p>
      )}
      {error && (
        <div style={{ textAlign: "center", marginTop: 24, padding: 16, background: "#fef2f2", borderRadius: 12 }}>
          <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>
          <p style={{ color: "#6b7280", fontSize: 14, marginTop: 8 }}>Close this window and try again from the app.</p>
        </div>
      )}
    </div>
  );
}
